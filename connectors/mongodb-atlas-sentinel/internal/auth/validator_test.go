package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestAcceptsAppRoleAndCustomScope(t *testing.T) {
	iss := newIssuer(t)
	v := validatorFor(t, iss)
	for _, tc := range []struct {
		name   string
		claims accessClaims
	}{
		{name: "app role", claims: iss.baseClaims(time.Now().Add(time.Hour), mapRoles("Logs.Ingest"), "")},
		{name: "custom scope", claims: iss.baseClaims(time.Now().Add(time.Hour), nil, "Logs.Ingest")},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p, err := v.Validate(context.Background(), iss.sign(t, tc.claims))
			if err != nil {
				t.Fatal(err)
			}
			if p.ClientID != iss.clientID || p.TenantID != iss.tenant {
				t.Fatalf("principal %+v", p)
			}
		})
	}
}

func TestRejectsStaticAndConfusedTokens(t *testing.T) {
	iss := newIssuer(t)
	v := validatorFor(t, iss)
	now := time.Now()
	good := iss.baseClaims(now.Add(time.Hour), mapRoles("Logs.Ingest"), "")
	hsKey := []byte("not-the-rsa-key-material!!")
	hs := jwt.NewWithClaims(jwt.SigningMethodHS256, good)
	hs.Header["kid"] = iss.kid
	hsSigned, err := hs.SignedString(hsKey)
	if err != nil {
		t.Fatal(err)
	}
	none := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ0aWQiOiJhYWFhYWFhYS1iYmJiLWNjY2MtZGRkZC1lZWVlZWVlZWVlZWUifQ."
	cases := []struct {
		name   string
		token  string
		reason string
	}{
		{name: "static", token: "super-secret-token", reason: "malformed"},
		{name: "none", token: none, reason: "bad-signature"},
		{name: "hs256", token: hsSigned, reason: "bad-signature"},
		{name: "expired", token: iss.sign(t, iss.baseClaims(now.Add(-2*time.Hour), mapRoles("Logs.Ingest"), "")), reason: "expired"},
		{name: "wrong audience", token: iss.sign(t, withAud(iss.baseClaims(now.Add(time.Hour), mapRoles("Logs.Ingest"), ""), "api://other")), reason: "audience"},
		{name: "wrong role", token: iss.sign(t, iss.baseClaims(now.Add(time.Hour), mapRoles("Other.Role"), "")), reason: "missing-permission"},
		{name: "unknown tenant", token: iss.sign(t, withTenant(iss.baseClaims(now.Add(time.Hour), mapRoles("Logs.Ingest"), ""), "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")), reason: "unknown-tenant"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := v.Validate(context.Background(), tc.token)
			if err == nil {
				t.Fatal("expected rejection")
			}
			if FormatReason(err) != tc.reason {
				t.Fatalf("reason %s: %v", FormatReason(err), err)
			}
		})
	}
}

type issuer struct {
	srv      *httptest.Server
	key      *rsa.PrivateKey
	kid      string
	tenant   string
	clientID string
	audience string
}

func newIssuer(t *testing.T) *issuer {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	iss := &issuer{
		key:      key,
		kid:      "test-key",
		tenant:   "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		clientID: "11111111-2222-3333-4444-555555555555",
		audience: "api://atlas-sentinel",
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/"+iss.tenant+"/discovery/v2.0/keys", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{publicJWK(iss.key, iss.kid)}})
	})
	iss.srv = httptest.NewServer(mux)
	t.Cleanup(iss.srv.Close)
	return iss
}

func validatorFor(t *testing.T, iss *issuer) *Validator {
	t.Helper()
	v, err := NewValidator(iss.srv.URL, []string{iss.audience}, "Logs.Ingest", "Logs.Ingest")
	if err != nil {
		t.Fatal(err)
	}
	v.SetTenants([]string{iss.tenant})
	return v
}

func (i *issuer) baseClaims(exp time.Time, roles json.RawMessage, scope string) accessClaims {
	return accessClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "https://login.microsoftonline.com/" + i.tenant + "/v2.0",
			Audience:  jwt.ClaimStrings{i.audience},
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-time.Minute)),
			NotBefore: jwt.NewNumericDate(time.Now().Add(-time.Minute)),
		},
		Tid:   i.tenant,
		Roles: roles,
		Scp:   scope,
		Azp:   i.clientID,
		Ver:   "2.0",
	}
}

func (i *issuer) sign(t *testing.T, claims accessClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = i.kid
	s, err := tok.SignedString(i.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func mapRoles(roles ...string) json.RawMessage {
	b, _ := json.Marshal(roles)
	return b
}

func withAud(c accessClaims, aud string) accessClaims {
	c.Audience = jwt.ClaimStrings{aud}
	return c
}

func withTenant(c accessClaims, tenant string) accessClaims {
	c.Tid = tenant
	c.Issuer = "https://login.microsoftonline.com/" + tenant + "/v2.0"
	return c
}

func publicJWK(key *rsa.PrivateKey, kid string) map[string]string {
	return map[string]string{
		"kty": "RSA",
		"use": "sig",
		"alg": "RS256",
		"kid": kid,
		"n":   base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
		"e":   base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
	}
}
