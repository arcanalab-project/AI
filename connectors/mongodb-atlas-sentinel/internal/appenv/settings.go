// Package appenv reads process settings. Secret values are names or vault
// URLs, never the secret itself.
package appenv

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/sink"
)

// Settings configures the ingest process.
type Settings struct {
	ProjectsPath      string
	AppConfigEndpoint string
	Audiences         []string
	RequiredRole      string
	RequiredScope     string
	KeyVaultURL       string
	TLSCertName       string
	DefaultSink       model.Sink
	AllowInsecureDev  bool
	TLSAddr           string
	HealthAddr        string
	MaxBody           int64
	Replica           string
	Heartbeat         time.Duration
	OTLPHostname      string
	InAzure           bool
}

// PublisherSettings configures the token publisher.
type PublisherSettings struct {
	ProjectsPath      string
	AppConfigEndpoint string
	TenantID          string
	ClientID          string
	Scope             string
	Audiences         []string
	RequiredRole      string
	RequiredScope     string
	KeyVaultURL       string
	CertName          string
	AtlasClientID     string
	AtlasSecretName   string
	OTLPEndpoint      string
	AtlasBaseURL      string
	TokenURL          string
	Refresh           time.Duration
	InAzure           bool
}

// LoadIngest reads ingest settings from the environment.
func LoadIngest() (Settings, error) {
	s := Settings{
		ProjectsPath:      os.Getenv("PROJECTS_CONFIG_PATH"),
		AppConfigEndpoint: strings.TrimSpace(os.Getenv("APP_CONFIGURATION_ENDPOINT")),
		Audiences:         splitComma(os.Getenv("ENTRA_AUDIENCE")),
		RequiredRole:      envDefault("REQUIRED_ROLE", "Logs.Ingest"),
		RequiredScope:     envDefault("REQUIRED_SCOPE", "Logs.Ingest"),
		KeyVaultURL:       strings.TrimSpace(os.Getenv("KEYVAULT_URL")),
		TLSCertName:       strings.TrimSpace(os.Getenv("TLS_CERT_NAME")),
		DefaultSink: model.Sink{
			DCEEndpoint:    strings.TrimSpace(os.Getenv("DCE_ENDPOINT")),
			DCRImmutableID: strings.TrimSpace(os.Getenv("DCR_IMMUTABLE_ID")),
			Stream:         envDefault("DCR_STREAM", "Custom-MongoDBAtlasLogs_CL"),
			Table:          envDefault("DCR_TABLE", "MongoDBAtlasLogs_CL"),
		},
		AllowInsecureDev: os.Getenv("ALLOW_INSECURE_DEV") == "true",
		TLSAddr:          envDefault("TLS_ADDR", ":8443"),
		HealthAddr:       envDefault("HEALTH_ADDR", ":8080"),
		Replica:          envDefault("INGEST_REPLICA", hostname()),
		OTLPHostname:     strings.TrimSpace(os.Getenv("OTLP_HOSTNAME")),
		InAzure:          inAzure(),
	}
	s.MaxBody = 8 << 20
	if raw := os.Getenv("MAX_BODY_BYTES"); raw != "" {
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 1024 {
			return Settings{}, fmt.Errorf("MAX_BODY_BYTES")
		}
		s.MaxBody = n
	}
	s.Heartbeat = 15 * time.Minute
	if raw := os.Getenv("HEARTBEAT_INTERVAL"); raw != "" {
		if raw == "0" {
			s.Heartbeat = 0
		} else {
			d, err := time.ParseDuration(raw)
			if err != nil {
				return Settings{}, fmt.Errorf("HEARTBEAT_INTERVAL")
			}
			s.Heartbeat = d
		}
	}
	if err := s.Validate(); err != nil {
		return Settings{}, err
	}
	return s, nil
}

// Validate fails closed.
func (s Settings) Validate() error {
	if len(s.Audiences) == 0 {
		return fmt.Errorf("ENTRA_AUDIENCE is required")
	}
	if s.RequiredRole == "" && s.RequiredScope == "" {
		return fmt.Errorf("REQUIRED_ROLE or REQUIRED_SCOPE is required")
	}
	if s.InAzure && s.AllowInsecureDev {
		return fmt.Errorf("ALLOW_INSECURE_DEV is ignored in Azure and refuses to start")
	}
	if s.InAzure && s.AppConfigEndpoint == "" {
		return fmt.Errorf("APP_CONFIGURATION_ENDPOINT is required in Azure")
	}
	if s.AppConfigEndpoint == "" && s.ProjectsPath == "" {
		return fmt.Errorf("PROJECTS_CONFIG_PATH or APP_CONFIGURATION_ENDPOINT is required")
	}
	if s.InAzure || !s.AllowInsecureDev {
		if s.KeyVaultURL == "" || s.TLSCertName == "" {
			return fmt.Errorf("KEYVAULT_URL and TLS_CERT_NAME are required")
		}
		if err := sink.Validate(s.DefaultSink); err != nil {
			return fmt.Errorf("default sink: %w", err)
		}
	}
	if s.InAzure && s.OTLPHostname == "" {
		return fmt.Errorf("OTLP_HOSTNAME is required in Azure")
	}
	return nil
}

// LoadPublisher reads publisher settings from the environment.
func LoadPublisher() (PublisherSettings, error) {
	s := PublisherSettings{
		ProjectsPath:      os.Getenv("PROJECTS_CONFIG_PATH"),
		AppConfigEndpoint: strings.TrimSpace(os.Getenv("APP_CONFIGURATION_ENDPOINT")),
		TenantID:          strings.TrimSpace(os.Getenv("ENTRA_TENANT_ID")),
		ClientID:          strings.TrimSpace(os.Getenv("ENTRA_CLIENT_ID")),
		Scope:             strings.TrimSpace(os.Getenv("ENTRA_SCOPE")),
		Audiences:         splitComma(os.Getenv("ENTRA_AUDIENCE")),
		RequiredRole:      envDefault("REQUIRED_ROLE", "Logs.Ingest"),
		RequiredScope:     envDefault("REQUIRED_SCOPE", "Logs.Ingest"),
		KeyVaultURL:       strings.TrimSpace(os.Getenv("KEYVAULT_URL")),
		CertName:          strings.TrimSpace(os.Getenv("ENTRA_CERT_NAME")),
		AtlasClientID:     strings.TrimSpace(os.Getenv("ATLAS_CLIENT_ID")),
		AtlasSecretName:   strings.TrimSpace(os.Getenv("ATLAS_CLIENT_SECRET_NAME")),
		OTLPEndpoint:      strings.TrimSpace(os.Getenv("OTLP_ENDPOINT")),
		AtlasBaseURL:      envDefault("ATLAS_API_BASE", "https://cloud.mongodb.com"),
		Refresh:           20 * time.Minute,
		InAzure:           inAzure(),
	}
	if raw := os.Getenv("REFRESH_INTERVAL"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil || d < 5*time.Minute {
			return PublisherSettings{}, fmt.Errorf("REFRESH_INTERVAL must be at least 5m")
		}
		s.Refresh = d
	}
	s.TokenURL = envDefault("ENTRA_TOKEN_URL", "https://login.microsoftonline.com/"+s.TenantID+"/oauth2/v2.0/token")
	if err := s.Validate(); err != nil {
		return PublisherSettings{}, err
	}
	return s, nil
}

// Validate fails closed for the publisher.
func (s PublisherSettings) Validate() error {
	if s.TenantID == "" || s.ClientID == "" || s.Scope == "" || len(s.Audiences) == 0 {
		return fmt.Errorf("ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_SCOPE, and ENTRA_AUDIENCE are required")
	}
	if strings.Contains(s.Scope, " ") {
		return fmt.Errorf("ENTRA_SCOPE must be a single scope")
	}
	if s.InAzure && s.AppConfigEndpoint == "" {
		return fmt.Errorf("APP_CONFIGURATION_ENDPOINT is required in Azure")
	}
	if s.AppConfigEndpoint == "" && s.ProjectsPath == "" {
		return fmt.Errorf("PROJECTS_CONFIG_PATH or APP_CONFIGURATION_ENDPOINT is required")
	}
	if s.KeyVaultURL == "" || s.CertName == "" || s.AtlasClientID == "" || s.AtlasSecretName == "" {
		return fmt.Errorf("KEYVAULT_URL, ENTRA_CERT_NAME, ATLAS_CLIENT_ID, and ATLAS_CLIENT_SECRET_NAME are required")
	}
	if !strings.HasPrefix(s.OTLPEndpoint, "https://") || len(s.OTLPEndpoint) > 2048 {
		return fmt.Errorf("OTLP_ENDPOINT must be an https URL of at most 2048 characters")
	}
	if !strings.HasPrefix(s.AtlasBaseURL, "https://") {
		return fmt.Errorf("ATLAS_API_BASE must be https")
	}
	return nil
}

func splitComma(raw string) []string {
	var out []string
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func envDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func hostname() string {
	name, err := os.Hostname()
	if err != nil || name == "" {
		return "unknown"
	}
	return name
}

func inAzure() bool {
	return os.Getenv("IDENTITY_ENDPOINT") != "" || os.Getenv("MSI_ENDPOINT") != ""
}
