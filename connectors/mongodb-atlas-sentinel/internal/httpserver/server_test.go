package httpserver

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/ingest"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
)

func TestHealthIsOpenAndLogsRequireEntra(t *testing.T) {
	iss := newIssuer(t)
	h := newServer(t, iss.validator(t))
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	h.serve(rec, req, true)
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "0.9.0") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}

	body := []byte(`{"resourceLogs":[]}`)
	req = httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer super-secret-token")
	rec = httptest.NewRecorder()
	h.serve(rec, req, true)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("static token status %d", rec.Code)
	}

	req = httptest.NewRequest(http.MethodPost, "/v1/logs", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+iss.token(t, time.Now().Add(time.Hour)))
	rec = httptest.NewRecorder()
	h.serve(rec, req, true)
	if rec.Code != http.StatusOK {
		t.Fatalf("empty export %d %s", rec.Code, rec.Body.String())
	}
}

func TestGzipExport(t *testing.T) {
	iss := newIssuer(t)
	h := newServer(t, iss.validator(t))
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	_, _ = gz.Write([]byte(`{"resourceLogs":[]}`))
	_ = gz.Close()
	req := httptest.NewRequest(http.MethodPost, "/v1/logs", &buf)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Content-Encoding", "gzip")
	req.Header.Set("Authorization", "Bearer "+iss.token(t, time.Now().Add(time.Hour)))
	rec := httptest.NewRecorder()
	h.serve(rec, req, true)
	if rec.Code != http.StatusOK {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func newServer(t *testing.T, v *auth.Validator) *Server {
	t.Helper()
	set, err := config.Parse([]byte(`{"projects":[{"displayName":"tax","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"],"sink":{"dceEndpoint":"https://one.westeurope-1.ingest.monitor.azure.com","dcrImmutableId":"dcr-0123456789abcdef0123456789abcdef","stream":"Custom-MongoDBAtlasLogs_CL","table":"MongoDBAtlasLogs_CL"}}]}`), model.Sink{})
	if err != nil {
		t.Fatal(err)
	}
	return &Server{
		Validator: v,
		Version:   "0.9.0",
		Projects:  func() int { return set.Len() },
		Ingest: &ingest.Service{
			Projects: func() *config.Set { return set },
			Uploader: discard{},
			Now:      time.Now,
			Version:  "0.9.0",
		},
	}
}

type discard struct{}

func (discard) Upload(context.Context, model.Sink, []model.Record) error { return nil }

type issuer struct {
	base     string
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
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]string{
			"kty": "RSA", "use": "sig", "alg": "RS256", "kid": iss.kid,
			"n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	iss.base = srv.URL
	return iss
}

func (i *issuer) validator(t *testing.T) *auth.Validator {
	t.Helper()
	v, err := auth.NewValidator(i.base, []string{i.audience}, "Logs.Ingest", "Logs.Ingest")
	if err != nil {
		t.Fatal(err)
	}
	v.SetTenants([]string{i.tenant})
	return v
}

func (i *issuer) token(t *testing.T, exp time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{
		"iss":   "https://login.microsoftonline.com/" + i.tenant + "/v2.0",
		"aud":   i.audience,
		"exp":   exp.Unix(),
		"nbf":   time.Now().Add(-time.Minute).Unix(),
		"iat":   time.Now().Add(-time.Minute).Unix(),
		"tid":   i.tenant,
		"azp":   i.clientID,
		"ver":   "2.0",
		"roles": []string{"Logs.Ingest"},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = i.kid
	s, err := tok.SignedString(i.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
