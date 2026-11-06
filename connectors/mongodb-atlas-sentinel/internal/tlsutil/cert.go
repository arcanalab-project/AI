// Package tlsutil loads the OTLP certificate from Key Vault.
package tlsutil

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azsecrets"
	"software.sslmate.com/src/go-pkcs12"
)

// LoadPFX parses a Key Vault PKCS#12 secret. Vault exports use an empty password.
func LoadPFX(raw []byte) (tls.Certificate, *x509.Certificate, error) {
	if decoded, err := base64.StdEncoding.DecodeString(string(raw)); err == nil && len(decoded) > 16 {
		raw = decoded
	}
	key, leaf, chain, err := pkcs12.DecodeChain(raw, "")
	if err != nil {
		key, leaf, err = pkcs12.Decode(raw, "")
		if err != nil {
			return tls.Certificate{}, nil, fmt.Errorf("parse certificate: %w", err)
		}
	}
	tlsCert := tls.Certificate{PrivateKey: key, Leaf: leaf, Certificate: [][]byte{leaf.Raw}}
	for _, ca := range chain {
		tlsCert.Certificate = append(tlsCert.Certificate, ca.Raw)
	}
	return tlsCert, leaf, nil
}

// LoadFromVault reads the certificate secret with the caller credential.
func LoadFromVault(ctx context.Context, vaultURL, name string, cred azcore.TokenCredential) (tls.Certificate, *x509.Certificate, error) {
	client, err := azsecrets.NewClient(vaultURL, cred, nil)
	if err != nil {
		return tls.Certificate{}, nil, err
	}
	resp, err := client.GetSecret(ctx, name, "", nil)
	if err != nil {
		return tls.Certificate{}, nil, err
	}
	if resp.Value == nil || *resp.Value == "" {
		return tls.Certificate{}, nil, errors.New("key vault certificate secret is empty")
	}
	return LoadPFX([]byte(*resp.Value))
}

// Check reports a certificate that Atlas would reject or that does not match
// the private hostname.
func Check(cert *x509.Certificate, hostname string, rejectSelfSigned bool) error {
	if cert == nil {
		return errors.New("certificate is missing")
	}
	if rejectSelfSigned && selfSigned(cert) {
		return errors.New("self-signed certificate is not accepted in Azure; Atlas requires a public CA")
	}
	if hostname != "" {
		if err := cert.VerifyHostname(hostname); err != nil {
			return fmt.Errorf("certificate does not match %s: %w", hostname, err)
		}
	}
	return nil
}

func selfSigned(cert *x509.Certificate) bool {
	if len(cert.RawSubject) == 0 || string(cert.RawSubject) != string(cert.RawIssuer) {
		return false
	}
	return cert.CheckSignature(cert.SignatureAlgorithm, cert.RawTBSCertificate, cert.Signature) == nil
}
