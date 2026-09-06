package identity

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/binary"
	"fmt"
)

// newOpaqueToken generates a URL-safe bearer token. Only its hash is ever
// persisted; the plaintext is returned to the caller exactly once.
func newOpaqueToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("identity: generate token: %w", err)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(buf), nil
}

func hashToken(plain string) []byte {
	sum := sha256.Sum256([]byte(plain))
	return sum[:]
}

// newOTPCode generates a six-digit numeric code, biased-free via rejection
// is unnecessary at this range (uint32 mod 1e6 bias is negligible and this
// is a low-value, short-lived, rate-limited secret).
func newOTPCode() (string, []byte, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", nil, fmt.Errorf("identity: generate otp: %w", err)
	}
	code := fmt.Sprintf("%06d", binary.BigEndian.Uint32(b[:])%1_000_000)
	sum := sha256.Sum256([]byte(code))
	return code, sum[:], nil
}
