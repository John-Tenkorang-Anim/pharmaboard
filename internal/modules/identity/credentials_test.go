package identity

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type fakeGoogle struct {
	identity GoogleIdentity
	err      error
}

func (g fakeGoogle) Verify(context.Context, string) (GoogleIdentity, error) { return g.identity, g.err }
func TestProductionHasNoOTP(t *testing.T) {
	for _, path := range []string{"/otp/request", "/otp/verify", "/register"} {
		w := httptest.NewRecorder()
		Routes(NewService(nil, "production")).ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`)))
		if w.Code != 404 {
			t.Fatalf("%s returned %d", path, w.Code)
		}
	}
}
func TestEmailNormalization(t *testing.T) {
	got, err := normalizeEmail("  Ama@Example.com ")
	if err != nil || got != "ama@example.com" {
		t.Fatal(got, err)
	}
	for _, email := range []string{"Ama <ama@example.com>", "no-domain", ""} {
		if _, err := normalizeEmail(email); err == nil {
			t.Fatalf("accepted %q", email)
		}
	}
}
func TestCredentialsIntegration(t *testing.T) {
	url := os.Getenv("PHARMABOARD_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("requires migrated test database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	repo := NewPostgresRepository(pool)
	svc := NewService(repo, "production")
	suffix := uuid.NewString()
	email := "auth-" + suffix + "@example.com"
	googleEmail := "google-" + suffix + "@example.com"
	// Cleanup in referential order after the test.
	defer func() {
		pool.Exec(ctx, `DELETE FROM sessions WHERE user_id IN(SELECT id FROM users WHERE email=ANY($1))`, []string{email, googleEmail})
		pool.Exec(ctx, `DELETE FROM account_credentials WHERE user_id IN(SELECT id FROM users WHERE email=ANY($1))`, []string{email, googleEmail})
		pool.Exec(ctx, `DELETE FROM users WHERE email=ANY($1)`, []string{email, googleEmail})
	}()
	in := RegisterInput{AccountKind: AccountKindStudent, DisplayName: "Ama Mensah", Email: &email}
	session, err := svc.CreateAccount(ctx, in, "memorable password words", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = svc.Authenticate(ctx, session.Token); err != nil {
		t.Fatal(err)
	}
	login, err := svc.PasswordLogin(ctx, strings.ToUpper(email), "memorable password words")
	if err != nil || login.UserID != session.UserID {
		t.Fatal(login, err)
	}
	if _, err = svc.PasswordLogin(ctx, email, "wrong password"); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatal(err)
	}
	if _, err = svc.CreateAccount(ctx, in, "memorable password words", ""); !errors.Is(err, ErrAlreadyExists) {
		t.Fatal(err)
	}
	// A Google identity with matching email cannot take over a password account.
	svc.google = fakeGoogle{identity: GoogleIdentity{Subject: suffix, Email: email, Name: "Ama Mensah"}}
	if _, err = svc.GoogleLogin(ctx, "verified-token", in); !errors.Is(err, ErrAlreadyExists) {
		t.Fatal("unsafe linking", err)
	}
	svc.google = fakeGoogle{identity: GoogleIdentity{Subject: suffix, Email: googleEmail, Name: "Ama Mensah"}}
	if _, err = svc.GoogleLogin(ctx, "verified-token", RegisterInput{}); !errors.Is(err, errGoogleSignup) {
		t.Fatal(err)
	}
	googleSession, err := svc.GoogleLogin(ctx, "verified-token", in)
	if err != nil {
		t.Fatal(err)
	}
	repeat, err := svc.GoogleLogin(ctx, "verified-token", RegisterInput{})
	if err != nil || repeat.UserID != googleSession.UserID {
		t.Fatal(repeat, err)
	}
	svc.google = fakeGoogle{err: errors.New("invalid signature")}
	if _, err = svc.GoogleLogin(ctx, "forged-token", in); !errors.Is(err, ErrInvalidCredentials) {
		t.Fatal(err)
	}
	for i := 0; i < 11; i++ {
		_, err = svc.PasswordLogin(ctx, email, "incorrect password")
	}
	if !errors.Is(err, ErrTooManyAttempts) {
		t.Fatal("missing limit", err)
	}
}
