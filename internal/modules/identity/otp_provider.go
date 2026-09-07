package identity

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

var ErrOTPUnavailable = errors.New("Verification is temporarily unavailable. Please try again later.")
var phonePattern = regexp.MustCompile(`^\+[1-9][0-9]{7,14}$`)
var codePattern = regexp.MustCompile(`^[0-9]{6}$`)

type OTPProvider interface {
	Send(context.Context, string) error
	Check(context.Context, string, string) (bool, error)
}

type TwilioVerify struct {
	accountSID, authToken, serviceSID string
	client                            *http.Client
	baseURL                           string
}

func NewTwilioVerify(accountSID, authToken, serviceSID string) *TwilioVerify {
	return &TwilioVerify{accountSID: accountSID, authToken: authToken, serviceSID: serviceSID, baseURL: "https://verify.twilio.com/v2", client: &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (p *TwilioVerify) request(ctx context.Context, path string, values url.Values) (string, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/Services/"+url.PathEscape(p.serviceSID)+path, strings.NewReader(values.Encode()))
	if err != nil {
		return "", 0, ErrOTPUnavailable
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(p.accountSID, p.authToken)
	res, err := p.client.Do(req)
	if err != nil {
		return "", 0, ErrOTPUnavailable
	}
	defer res.Body.Close()
	if res.StatusCode == 429 {
		return "", 429, ErrTooManyAttempts
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
		return "", res.StatusCode, ErrOTPUnavailable
	}
	var body struct {
		Status string `json:"status"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 65536)).Decode(&body) != nil {
		return "", res.StatusCode, ErrOTPUnavailable
	}
	return body.Status, res.StatusCode, nil
}
func (p *TwilioVerify) Send(ctx context.Context, phone string) error {
	status, _, err := p.request(ctx, "/Verifications", url.Values{"To": {phone}, "Channel": {"sms"}})
	if err != nil {
		return err
	}
	if status != "pending" {
		return ErrOTPUnavailable
	}
	return nil
}
func (p *TwilioVerify) Check(ctx context.Context, phone, code string) (bool, error) {
	status, httpStatus, err := p.request(ctx, "/VerificationCheck", url.Values{"To": {phone}, "Code": {code}})
	// Expired, already-approved and deleted verifications are returned as 404.
	if httpStatus == 404 {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return status == "approved", nil
}
