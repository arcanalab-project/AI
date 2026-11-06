package appenv

import (
	"testing"
)

func TestInsecureDevRefusedWhenAzureIdentityPresent(t *testing.T) {
	t.Setenv("IDENTITY_ENDPOINT", "http://127.0.0.1")
	t.Setenv("ALLOW_INSECURE_DEV", "true")
	t.Setenv("ENTRA_AUDIENCE", "api://atlas-sentinel")
	t.Setenv("APP_CONFIGURATION_ENDPOINT", "https://example.azconfig.io")
	t.Setenv("KEYVAULT_URL", "https://kv.vault.azure.net/")
	t.Setenv("TLS_CERT_NAME", "otlp")
	t.Setenv("DCE_ENDPOINT", "https://dce.westeurope-1.ingest.monitor.azure.com")
	t.Setenv("DCR_IMMUTABLE_ID", "dcr-0123456789abcdef0123456789abcdef")
	t.Setenv("OTLP_HOSTNAME", "otel.example.com")
	if _, err := LoadIngest(); err == nil {
		t.Fatal("expected refusal")
	}
}

func TestAllowInsecureDevRequiresExactTrue(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_DEV", "yes")
	t.Setenv("ENTRA_AUDIENCE", "api://atlas-sentinel")
	t.Setenv("PROJECTS_CONFIG_PATH", "projects.yaml")
	if _, err := LoadIngest(); err == nil {
		t.Fatal("yes is not an insecure opt-in and TLS settings are missing")
	}
}

func TestLocalFileMode(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_DEV", "true")
	t.Setenv("ENTRA_AUDIENCE", "api://atlas-sentinel")
	t.Setenv("PROJECTS_CONFIG_PATH", "projects.yaml")
	s, err := LoadIngest()
	if err != nil {
		t.Fatal(err)
	}
	if !s.AllowInsecureDev || s.RequiredRole != "Logs.Ingest" {
		t.Fatalf("%+v", s)
	}
}
