package atlasapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestPutUsesServiceAccountAndRedactsErrors(t *testing.T) {
	var sawBasic, sawPut bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/api/oauth/token":
			user, pass, ok := r.BasicAuth()
			if !ok || user != "atlas-client" || pass != "atlas-test-secret-value" {
				t.Errorf("basic auth %s ok=%v", user, ok)
			}
			sawBasic = true
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "atlas-access", "expires_in": 3600})
		case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/logIntegrations/"):
			sawPut = true
			body, _ := io.ReadAll(r.Body)
			if strings.Contains(string(body), "atlas-test-secret-value") {
				t.Fatal("service account secret was written into the integration")
			}
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"error":"nope","echo":"atlas-test-secret-value Bearer atlas-access"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()
	c := &Client{
		BaseURL:  srv.URL,
		ClientID: "atlas-client",
		Secret:   func(context.Context) (string, error) { return "atlas-test-secret-value", nil },
	}
	err := c.PutOTel(context.Background(), "6650aa001122334455667788", "6650aa001122334455667799", OTelExport{
		Type: "OTEL_LOG_EXPORT", LogTypes: []string{"MONGOD"}, Endpoint: "https://otel.example/v1/logs",
		Headers: []Header{{Name: "Authorization", Value: "Bearer header.jwt.value"}},
	})
	if err == nil || strings.Contains(err.Error(), "atlas-test-secret-value") || strings.Contains(err.Error(), "atlas-access") {
		t.Fatalf("error leaked or missing: %v", err)
	}
	if !sawBasic || !sawPut {
		t.Fatalf("basic %v put %v", sawBasic, sawPut)
	}
}

func TestCreateReturnsID(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/oauth/token" {
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "atlas-access", "expires_in": 3600})
			return
		}
		if r.Method != http.MethodPost {
			t.Fatalf("method %s", r.Method)
		}
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"6650aa001122334455667799","otelSuppliedHeaders":[{"name":"Authorization"}]}`))
	}))
	defer srv.Close()
	c := &Client{BaseURL: srv.URL, ClientID: "atlas-client", Secret: func(context.Context) (string, error) { return "atlas-test-secret-value", nil }}
	id, err := c.CreateOTel(context.Background(), "6650aa001122334455667788", OTelExport{Type: "OTEL_LOG_EXPORT", LogTypes: []string{"MONGOD"}, Endpoint: "https://otel.example/v1/logs", Headers: []Header{{Name: "Authorization", Value: "Bearer a.b.c"}}})
	if err != nil || id != "6650aa001122334455667799" {
		t.Fatalf("%s %v", id, err)
	}
}
