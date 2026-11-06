package tokenpub

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"math/big"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

var errMissingThumb = errString("missing x5t")

type errString string

func (e errString) Error() string { return string(e) }

func TestAssertionCarriesThumbprint(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "atlas-sentinel-test"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := (PEMSigner{Key: key, Cert: cert}).Assertion(context.Background(), "https://login.microsoftonline.com/tenant/oauth2/v2.0/token", "11111111-2222-3333-4444-555555555555", time.Now())
	if err != nil {
		t.Fatal(err)
	}
	tok, err := jwt.Parse(raw, func(tok *jwt.Token) (any, error) {
		if tok.Header["x5t"] == "" {
			return nil, errMissingThumb
		}
		return &key.PublicKey, nil
	}, jwt.WithValidMethods([]string{"RS256"}))
	if err != nil || !tok.Valid {
		t.Fatal(err)
	}
}
