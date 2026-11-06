package tokenpub

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"time"
)

// Signer produces an Entra client assertion. Implementations must not return
// a long-lived secret.
type Signer interface {
	Assertion(ctx context.Context, audience, clientID string, now time.Time) (string, error)
}

// PEMSigner signs with a certificate private key held in memory for tests
// and for a process that already loaded the key. Production uses KVSigner.
type PEMSigner struct {
	Key  *rsa.PrivateKey
	Cert *x509.Certificate
}

// Assertion builds a client-credentials JWT with the certificate thumbprint.
func (s PEMSigner) Assertion(_ context.Context, audience, clientID string, now time.Time) (string, error) {
	return signAssertion(s.Cert, audience, clientID, now, func(digest []byte) ([]byte, error) {
		return rsa.SignPKCS1v15(rand.Reader, s.Key, crypto.SHA256, digest)
	})
}

func signAssertion(cert *x509.Certificate, audience, clientID string, now time.Time, sign func([]byte) ([]byte, error)) (string, error) {
	header := map[string]string{
		"alg": "RS256",
		"typ": "JWT",
		"x5t": base64.RawURLEncoding.EncodeToString(thumbprint(cert)),
	}
	payload := map[string]any{
		"aud": audience,
		"iss": clientID,
		"sub": clientID,
		"jti": newJTI(),
		"nbf": now.Add(-60 * time.Second).Unix(),
		"iat": now.Unix(),
		"exp": now.Add(10 * time.Minute).Unix(),
	}
	signingInput := b64(header) + "." + b64(payload)
	sum := sha256.Sum256([]byte(signingInput))
	sig, err := sign(sum[:])
	if err != nil {
		return "", err
	}
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

func thumbprint(cert *x509.Certificate) []byte {
	sum := sha1.Sum(cert.Raw)
	return sum[:]
}

func b64(v any) string {
	raw, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func newJTI() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return base64.RawURLEncoding.EncodeToString(b[:])
}
