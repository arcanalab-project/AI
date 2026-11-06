package tokenpub

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/atlasapi"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
)

func TestOncePublishesEntraJWTNotStaticSecret(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	const (
		tenant   = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
		clientID = "11111111-2222-3333-4444-555555555555"
		audience = "api://atlas-sentinel"
		group    = "6650aa001122334455667788"
		integ    = "6650aa001122334455667799"
	)
	var putBody []byte
	mux := http.NewServeMux()
	mux.HandleFunc("/"+tenant+"/discovery/v2.0/keys", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []any{map[string]string{
			"kty": "RSA", "kid": "k", "n": base64.RawURLEncoding.EncodeToString(key.N.Bytes()),
			"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(key.E)).Bytes()),
		}}})
	})
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		if strings.Contains(string(raw), "client_secret=") {
			t.Fatal("client secret grant was used")
		}
		if !strings.Contains(string(raw), "client_assertion=") {
			t.Fatal("missing client assertion")
		}
		claims := jwt.MapClaims{
			"iss": "https://login.microsoftonline.com/" + tenant + "/v2.0",
			"aud": audience, "exp": time.Now().Add(time.Hour).Unix(),
			"nbf": time.Now().Add(-time.Minute).Unix(), "iat": time.Now().Add(-time.Minute).Unix(),
			"tid": tenant, "azp": clientID, "ver": "2.0", "roles": []string{"Logs.Ingest"},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
		tok.Header["kid"] = "k"
		signed, err := tok.SignedString(key)
		if err != nil {
			t.Fatal(err)
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"access_token": signed})
	})
	mux.HandleFunc("/api/oauth/token", func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "atlas-api-token", "expires_in": 3600})
	})
	mux.HandleFunc("/api/atlas/v2/groups/"+group+"/logIntegrations/"+integ, func(w http.ResponseWriter, r *http.Request) {
		putBody, _ = io.ReadAll(r.Body)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"` + integ + `"}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	validator, err := auth.NewValidator(srv.URL, []string{audience}, "Logs.Ingest", "Logs.Ingest")
	if err != nil {
		t.Fatal(err)
	}
	validator.SetTenants([]string{tenant})
	set, err := config.Parse([]byte(`{"projects":[{"displayName":"tax","atlasGroupId":"`+group+`","entraTenantId":"`+tenant+`","allowedClientIds":["`+clientID+`"],"logIntegrationId":"`+integ+`","logTypes":["MONGOD","MONGOD_AUDIT"],"sink":{"dceEndpoint":"https://dce.westeurope-1.ingest.monitor.azure.com","dcrImmutableId":"dcr-0123456789abcdef0123456789abcdef","stream":"Custom-MongoDBAtlasLogs_CL","table":"MongoDBAtlasLogs_CL"}}]}`), model.Sink{})
	if err != nil {
		t.Fatal(err)
	}
	cert := selfCert(t, key)
	pub := &Publisher{
		Projects:  func() *config.Set { return set },
		Validator: validator,
		Signer:    PEMSigner{Key: key, Cert: cert},
		Atlas: &atlasapi.Client{
			BaseURL: srv.URL, ClientID: "atlas-client",
			Secret: func(context.Context) (string, error) { return "atlas-test-secret-value", nil },
		},
		HTTP:     srv.Client(),
		TokenURL: srv.URL + "/token",
		TenantID: tenant,
		ClientID: clientID,
		Scope:    audience + "/.default",
		Endpoint: "https://otel.example/v1/logs",
	}
	if err := pub.Once(context.Background()); err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(putBody), "atlas-test-secret-value") || strings.Contains(string(putBody), "static") {
		t.Fatalf("unexpected body %s", putBody)
	}
	if !strings.Contains(string(putBody), "Bearer ") || !strings.Contains(string(putBody), group) {
		t.Fatalf("body %s", putBody)
	}
}

func TestOnceRefusesNonJWTFromTokenEndpoint(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]string{"access_token": "static-bearer-token"})
	}))
	defer srv.Close()
	validator, err := auth.NewValidator(srv.URL, []string{"api://atlas-sentinel"}, "Logs.Ingest", "Logs.Ingest")
	if err != nil {
		t.Fatal(err)
	}
	validator.SetTenants([]string{"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"})
	set, err := config.Parse([]byte(`{"projects":[{"displayName":"tax","atlasGroupId":"6650aa001122334455667788","entraTenantId":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","allowedClientIds":["11111111-2222-3333-4444-555555555555"],"logIntegrationId":"6650aa001122334455667799"}]}`), model.Sink{
		DCEEndpoint: "https://dce.westeurope-1.ingest.monitor.azure.com", DCRImmutableID: "dcr-0123456789abcdef0123456789abcdef", Stream: "Custom-MongoDBAtlasLogs_CL", Table: "MongoDBAtlasLogs_CL",
	})
	if err != nil {
		t.Fatal(err)
	}
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	pub := &Publisher{
		Projects: func() *config.Set { return set }, Validator: validator,
		Signer: PEMSigner{Key: key, Cert: selfCert(t, key)},
		Atlas:  &atlasapi.Client{BaseURL: srv.URL, ClientID: "x", Secret: func(context.Context) (string, error) { return "atlas-test-secret-value", nil }},
		HTTP:   srv.Client(), TokenURL: srv.URL, TenantID: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
		ClientID: "11111111-2222-3333-4444-555555555555", Scope: "api://atlas-sentinel/.default", Endpoint: "https://otel.example/v1/logs",
	}
	if err := pub.Once(context.Background()); err == nil {
		t.Fatal("expected rejection of static token")
	}
}

func selfCert(t *testing.T, key *rsa.PrivateKey) *x509Cert {
	t.Helper()
	return mustCert(t, key)
}
