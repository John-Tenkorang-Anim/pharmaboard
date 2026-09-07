package identity

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestTwilioVerifyProtocol(t *testing.T) {
	status := "pending"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, pass, ok := r.BasicAuth()
		if !ok || user != "account" || pass != "secret" {
			t.Error("missing provider authentication")
		}
		if r.Method != "POST" {
			t.Error("wrong method")
		}
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if r.Form.Get("To") != "+233200000000" {
			t.Error("phone not encoded correctly")
		}
		if strings.HasSuffix(r.URL.Path, "/Verifications") {
			if r.Form.Get("Channel") != "sms" {
				t.Error("missing SMS channel")
			}
		} else if strings.HasSuffix(r.URL.Path, "/VerificationCheck") {
			if r.Form.Get("Code") != "123456" {
				t.Error("missing check code")
			}
		} else {
			t.Error("unexpected endpoint")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"` + status + `"}`))
	}))
	defer server.Close()
	p := NewTwilioVerify("account", "secret", "service")
	p.baseURL = server.URL
	if err := p.Send(context.Background(), "+233200000000"); err != nil {
		t.Fatal(err)
	}
	ok, err := p.Check(context.Background(), "+233200000000", "123456")
	if err != nil || ok {
		t.Fatal("pending must not authenticate")
	}
	status = "approved"
	ok, err = p.Check(context.Background(), "+233200000000", "123456")
	if err != nil || !ok {
		t.Fatal("approved must authenticate")
	}
}
func TestTwilioFailures(t *testing.T) {
	for _, status := range []int{404, 429, 401, 500} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				w.Write([]byte("private provider error"))
			}))
			defer server.Close()
			p := NewTwilioVerify("account", "secret", "service")
			p.baseURL = server.URL
			ok, err := p.Check(context.Background(), "+233200000000", "123456")
			if ok {
				t.Fatal("failure authenticated")
			}
			if status == 404 && err != nil {
				t.Fatal("expired check should be an invalid code")
			}
			if status == 429 && !errors.Is(err, ErrTooManyAttempts) {
				t.Fatal("missing rate limit error")
			}
			if status >= 500 && !errors.Is(err, ErrOTPUnavailable) {
				t.Fatal("missing unavailable error")
			}
			if err != nil && strings.Contains(err.Error(), "private") {
				t.Fatal("provider error leaked")
			}
		})
	}
}

type otpRepo struct {
	Repository
	user       User
	attempts   int16
	consumed   bool
	sessions   int
	reserveErr error
}

func (r *otpRepo) FindByContact(context.Context, Channel, string) (User, error) { return r.user, nil }
func (r *otpRepo) ReserveExternalOTP(context.Context, uuid.UUID, uuid.UUID, Channel, []byte, time.Time) error {
	if r.reserveErr != nil {
		return r.reserveErr
	}
	r.consumed = false
	return nil
}
func (r *otpRepo) IncrementOTPAttempts(context.Context, uuid.UUID, Channel) (int16, error) {
	if r.consumed {
		return 0, nil
	}
	r.attempts++
	return r.attempts, nil
}
func (r *otpRepo) ConsumeOTPChallenge(context.Context, uuid.UUID, Channel, []byte) (bool, error) {
	if r.consumed {
		return false, nil
	}
	r.consumed = true
	return true, nil
}
func (r *otpRepo) CreateSession(context.Context, uuid.UUID, uuid.UUID, []byte, time.Time) error {
	r.sessions++
	return nil
}

type otpFake struct {
	approved      bool
	sendErr       error
	sends, checks int
}

func (p *otpFake) Send(context.Context, string) error { p.sends++; return p.sendErr }
func (p *otpFake) Check(context.Context, string, string) (bool, error) {
	p.checks++
	return p.approved, nil
}
func TestProductionOTPFlow(t *testing.T) {
	repo := &otpRepo{user: User{ID: uuid.New()}}
	provider := &otpFake{}
	svc := NewService(repo, "production", provider)
	result, err := svc.RequestOTP(context.Background(), ChannelPhone, "+233 20 000 0000")
	if err != nil {
		t.Fatal(err)
	}
	if result.DevOnlyCode != "" || provider.sends != 1 {
		t.Fatal("production must send without returning a code")
	}
	if _, err = svc.VerifyOTP(context.Background(), ChannelPhone, "+233200000000", "123456"); !errors.Is(err, ErrInvalidCredentials) || repo.sessions != 0 {
		t.Fatal("wrong code created session")
	}
	provider.approved = true
	if _, err = svc.VerifyOTP(context.Background(), ChannelPhone, "+233200000000", "123456"); err != nil {
		t.Fatal(err)
	}
	if _, err = svc.VerifyOTP(context.Background(), ChannelPhone, "+233200000000", "123456"); !errors.Is(err, ErrInvalidCredentials) || repo.sessions != 1 {
		t.Fatal("replay created session")
	}
	repo.reserveErr = ErrTooManyAttempts
	if _, err = svc.RequestOTP(context.Background(), ChannelPhone, "+233200000000"); !errors.Is(err, ErrTooManyAttempts) || provider.sends != 1 {
		t.Fatal("reservation rate limit bypassed")
	}
}
func TestProductionOTPFailClosed(t *testing.T) {
	svc := NewService(&otpRepo{}, "production")
	if _, err := svc.RequestOTP(context.Background(), ChannelPhone, "+233200000000"); !errors.Is(err, ErrOTPUnavailable) {
		t.Fatal("missing provider must fail closed")
	}
	repo := &otpRepo{attempts: 5}
	provider := &otpFake{approved: true}
	svc = NewService(repo, "production", provider)
	if _, err := svc.VerifyOTP(context.Background(), ChannelPhone, "+233200000000", "123456"); !errors.Is(err, ErrTooManyAttempts) || provider.checks != 0 {
		t.Fatal("attempt limit bypassed")
	}
	if _, err := svc.RequestOTP(context.Background(), ChannelEmail, "a@example.com"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatal("unsupported channel accepted")
	}
}
