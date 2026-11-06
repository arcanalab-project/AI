package tokenpub

import (
	"context"
	"crypto/x509"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azcertificates"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azkeys"
)

// KVSigner signs the Entra client assertion with a non-exported Key Vault key.
// The private key does not leave the vault.
type KVSigner struct {
	Keys     *azkeys.Client
	Certs    *azcertificates.Client
	CertName string
	KeyName  string
}

// NewKVSigner builds clients for one vault. keyName usually matches certName.
func NewKVSigner(vaultURL, certName string, cred azcore.TokenCredential) (*KVSigner, error) {
	keys, err := azkeys.NewClient(vaultURL, cred, nil)
	if err != nil {
		return nil, err
	}
	certs, err := azcertificates.NewClient(vaultURL, cred, nil)
	if err != nil {
		return nil, err
	}
	return &KVSigner{Keys: keys, Certs: certs, CertName: certName, KeyName: certName}, nil
}

// Assertion signs a client-credentials JWT using the vault key.
func (s *KVSigner) Assertion(ctx context.Context, audience, clientID string, now time.Time) (string, error) {
	resp, err := s.Certs.GetCertificate(ctx, s.CertName, "", nil)
	if err != nil {
		return "", err
	}
	cert, err := x509.ParseCertificate(resp.CER)
	if err != nil {
		return "", err
	}
	return signAssertion(cert, audience, clientID, now, func(digest []byte) ([]byte, error) {
		signed, err := s.Keys.Sign(ctx, s.KeyName, "", azkeys.SignParameters{
			Algorithm: to.Ptr(azkeys.SignatureAlgorithmRS256),
			Value:     digest,
		}, nil)
		if err != nil {
			return nil, err
		}
		return signed.Result, nil
	})
}
