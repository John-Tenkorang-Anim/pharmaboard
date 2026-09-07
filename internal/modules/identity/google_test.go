package identity

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
)

func TestGoogleTokenValidation(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, nil)
	if err != nil {
		t.Fatal(err)
	}
	verifier := googleVerifier{oidc.NewVerifier("https://accounts.google.com", &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}}, &oidc.Config{ClientID: "our-client"})}
	for _, tc := range []struct {
		name, audience, issuer string
		expired, verified, ok  bool
	}{
		{"valid", "our-client", "https://accounts.google.com", false, true, true},
		{"wrong audience", "other-client", "https://accounts.google.com", false, true, false},
		{"wrong issuer", "our-client", "https://attacker.example", false, true, false},
		{"expired", "our-client", "https://accounts.google.com", true, true, false},
		{"unverified email", "our-client", "https://accounts.google.com", false, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			expiry := time.Now().Add(time.Hour)
			if tc.expired {
				expiry = time.Now().Add(-time.Hour)
			}
			token, err := jwt.Signed(signer).Claims(map[string]any{"iss": tc.issuer, "aud": tc.audience, "sub": "google-user-id", "exp": expiry.Unix(), "iat": time.Now().Add(-2 * time.Hour).Unix(), "email": "ama@example.com", "email_verified": tc.verified, "name": "Ama Mensah"}).Serialize()
			if err != nil {
				t.Fatal(err)
			}
			identity, err := verifier.Verify(context.Background(), token)
			if (err == nil) != tc.ok {
				t.Fatalf("identity=%+v error=%v", identity, err)
			}
			if tc.ok && identity.Subject != "google-user-id" {
				t.Fatal(identity)
			}
		})
	}
	if _, err = verifier.Verify(context.Background(), "forged.invalid.token"); err == nil {
		t.Fatal("accepted forged token")
	}
}
