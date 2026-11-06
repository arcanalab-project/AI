package main

import (
	"context"
	"errors"
	"flag"
	"log/slog"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"
	"github.com/Azure/azure-sdk-for-go/sdk/security/keyvault/azsecrets"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/appenv"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/atlasapi"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/buildinfo"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/redact"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/tokenpub"
)

var errEmptySecret = errors.New("key vault secret is empty")

func main() {
	bootstrap := flag.Bool("bootstrap", false, "create missing Atlas log integrations once and print their ids")
	flag.Parse()

	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	settings, err := appenv.LoadPublisher()
	if err != nil {
		logger.Error("configuration", "err", err.Error(), "version", buildinfo.Version)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		logger.Error("credential", "err", err.Error())
		os.Exit(1)
	}
	validator, err := auth.NewValidator("https://login.microsoftonline.com", settings.Audiences, settings.RequiredRole, settings.RequiredScope)
	if err != nil {
		logger.Error("auth", "err", err.Error())
		os.Exit(1)
	}
	var current atomic.Pointer[config.Set]
	load := func(ctx context.Context) (*config.Set, error) {
		if settings.AppConfigEndpoint != "" {
			lister, err := config.NewAzureLister(settings.AppConfigEndpoint, cred)
			if err != nil {
				return nil, err
			}
			return config.LoadRemoteAllowEmptySink(ctx, lister)
		}
		return config.LoadFileAllowEmptySink(settings.ProjectsPath)
	}
	if err := retry(ctx, logger, "projects", func() error {
		set, err := load(ctx)
		if err != nil {
			return err
		}
		current.Store(set)
		validator.SetTenants([]string{settings.TenantID})
		return nil
	}); err != nil {
		logger.Error("projects", "err", redact.Secrets(err.Error()))
		os.Exit(1)
	}

	signer, err := tokenpub.NewKVSigner(settings.KeyVaultURL, settings.CertName, cred)
	if err != nil {
		logger.Error("signer", "err", err.Error())
		os.Exit(1)
	}
	secrets, err := azsecrets.NewClient(settings.KeyVaultURL, cred, nil)
	if err != nil {
		logger.Error("key vault", "err", err.Error())
		os.Exit(1)
	}
	pub := &tokenpub.Publisher{
		Projects:  func() *config.Set { return current.Load() },
		Validator: validator,
		Signer:    signer,
		Atlas: &atlasapi.Client{
			BaseURL:  settings.AtlasBaseURL,
			ClientID: settings.AtlasClientID,
			Secret: func(ctx context.Context) (string, error) {
				resp, err := secrets.GetSecret(ctx, settings.AtlasSecretName, "", nil)
				if err != nil {
					return "", err
				}
				if resp.Value == nil {
					return "", errEmptySecret
				}
				return *resp.Value, nil
			},
		},
		TokenURL: settings.TokenURL,
		TenantID: settings.TenantID,
		ClientID: settings.ClientID,
		Scope:    settings.Scope,
		Endpoint: settings.OTLPEndpoint,
		Logger:   logger,
	}
	if *bootstrap {
		if err := pub.Bootstrap(ctx, os.Stdout); err != nil {
			logger.Error("bootstrap", "err", redact.Secrets(err.Error()))
			os.Exit(1)
		}
		return
	}
	logger.Info("token publisher started", "version", buildinfo.Version, "tenant", settings.TenantID)
	if err := pub.Once(ctx); err != nil {
		logger.Error("publish", "err", redact.Secrets(err.Error()))
	}
	ticker := time.NewTicker(settings.Refresh)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if set, err := load(ctx); err == nil && set.Len() > 0 {
				current.Store(set)
				validator.SetTenants([]string{settings.TenantID})
			} else {
				logger.Error("project reload failed", "err", redact.Secrets(errString(err)))
			}
			if err := pub.Once(ctx); err != nil {
				logger.Error("publish", "err", redact.Secrets(err.Error()))
			}
		}
	}
}

func retry(ctx context.Context, logger *slog.Logger, op string, fn func() error) error {
	deadline := time.Now().Add(5 * time.Minute)
	var last error
	for {
		if err := fn(); err == nil {
			return nil
		} else {
			last = err
			logger.Warn("retrying", "op", op, "err", redact.Secrets(err.Error()))
		}
		if time.Now().After(deadline) {
			return last
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(5 * time.Second):
		}
	}
}

func errString(err error) string {
	if err == nil {
		return "empty project list"
	}
	return err.Error()
}
