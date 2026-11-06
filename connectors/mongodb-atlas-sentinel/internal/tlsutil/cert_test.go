package tlsutil

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"math/big"
	"testing"
	"time"

	"software.sslmate.com/src/go-pkcs12"
)

func TestSelfSignedRejectedAndHostnameChecked(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject:      pkix.Name{CommonName: "otel.example.com"},
		DNSNames:     []string{"otel.example.com"},
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
	if err := Check(cert, "otel.example.com", true); err == nil {
		t.Fatal("expected self-signed rejection")
	}
	if err := Check(cert, "other.example.com", false); err == nil {
		t.Fatal("expected hostname mismatch")
	}
	pfx, err := pkcs12.Encode(rand.Reader, key, cert, nil, "")
	if err != nil {
		t.Fatal(err)
	}
	_, leaf, err := LoadPFX(pfx)
	if err != nil {
		t.Fatal(err)
	}
	if leaf.Subject.CommonName != "otel.example.com" {
		t.Fatal(leaf.Subject.CommonName)
	}
}
