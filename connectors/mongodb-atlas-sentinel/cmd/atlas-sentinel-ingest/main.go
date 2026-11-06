package main

import (
	"context"
	"crypto/tls"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/Azure/azure-sdk-for-go/sdk/azidentity"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/appenv"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/buildinfo"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/config"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/httpserver"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/ingest"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/redact"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/sink/azuremonitor"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/tlsutil"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)
	settings, err := appenv.LoadIngest()
	if err != nil {
		logger.Error("configuration", "err", err.Error(), "version", buildinfo.Version)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	validator, err := auth.NewValidator("https://login.microsoftonline.com", settings.Audiences, settings.RequiredRole, settings.RequiredScope)
	if err != nil {
		logger.Error("auth", "err", err.Error())
		os.Exit(1)
	}
	var current atomic.Pointer[config.Set]
	load := func(ctx context.Context) (*config.Set, error) {
		if settings.AppConfigEndpoint != "" {
			cred, err := azidentity.NewDefaultAzureCredential(nil)
			if err != nil {
				return nil, err
			}
			lister, err := config.NewAzureLister(settings.AppConfigEndpoint, cred)
			if err != nil {
				return nil, err
			}
			return config.LoadRemote(ctx, lister, settings.DefaultSink)
		}
		return config.LoadFile(settings.ProjectsPath, settings.DefaultSink)
	}
	if err := retry(ctx, logger, "projects", func() error {
		set, err := load(ctx)
		if err != nil {
			return err
		}
		current.Store(set)
		validator.SetTenants(set.TenantIDs())
		return nil
	}); err != nil {
		logger.Error("projects", "err", redact.Secrets(err.Error()))
		os.Exit(1)
	}

	uploader, err := newUploader(settings)
	if err != nil {
		logger.Error("sink", "err", err.Error())
		os.Exit(1)
	}
	svc := &ingest.Service{
		Projects: func() *config.Set { return current.Load() },
		Uploader: uploader,
		Replica:  settings.Replica,
		Version:  buildinfo.Version,
		Logger:   logger,
	}
	srv := &httpserver.Server{
		Validator: validator,
		Ingest:    svc,
		Logger:    logger,
		Version:   buildinfo.Version,
		Projects:  func() int { return current.Load().Len() },
		MaxBody:   settings.MaxBody,
	}

	go reloadLoop(ctx, logger, load, &current, validator)
	if settings.Heartbeat > 0 {
		go heartbeatLoop(ctx, svc, settings.Heartbeat)
	}

	errCh := make(chan error, 2)
	if settings.AllowInsecureDev {
		logger.Warn("OTLP listening without TLS because ALLOW_INSECURE_DEV=true")
		go func() {
			errCh <- httpserver.Listen(ctx, settings.TLSAddr, srv.Handler(), "", "")
		}()
	} else {
		var cert tls.Certificate
		if err := retry(ctx, logger, "tls", func() error {
			cred, err := azidentity.NewDefaultAzureCredential(nil)
			if err != nil {
				return err
			}
			loaded, leaf, err := tlsutil.LoadFromVault(ctx, settings.KeyVaultURL, settings.TLSCertName, cred)
			if err != nil {
				return err
			}
			if err := tlsutil.Check(leaf, settings.OTLPHostname, settings.InAzure); err != nil {
				return err
			}
			cert = loaded
			return nil
		}); err != nil {
			logger.Error("tls", "err", redact.Secrets(err.Error()))
			os.Exit(1)
		}
		go func() {
			errCh <- serveTLS(ctx, settings.TLSAddr, cert, srv.Handler())
		}()
		go func() {
			errCh <- httpserver.Listen(ctx, settings.HealthAddr, srv.HealthHandler(), "", "")
		}()
	}
	logger.Info("ingest started", "version", buildinfo.Version, "projects", current.Load().Len(), "azure", settings.InAzure)
	if err := <-errCh; err != nil && !errors.Is(err, context.Canceled) {
		logger.Error("server", "err", redact.Secrets(err.Error()))
		os.Exit(1)
	}
}

func newUploader(settings appenv.Settings) (ingest.Uploader, error) {
	if os.Getenv("SINK") == "discard" {
		if settings.InAzure || !settings.AllowInsecureDev {
			return nil, errors.New("SINK=discard is only available with ALLOW_INSECURE_DEV outside Azure")
		}
		return discardUploader{}, nil
	}
	cred, err := azidentity.NewDefaultAzureCredential(nil)
	if err != nil {
		return nil, err
	}
	return azuremonitor.New(cred), nil
}

type discardUploader struct{}

func (discardUploader) Upload(context.Context, model.Sink, []model.Record) error { return nil }

func reloadLoop(ctx context.Context, logger *slog.Logger, load func(context.Context) (*config.Set, error), current *atomic.Pointer[config.Set], validator *auth.Validator) {
	hup := make(chan os.Signal, 1)
	signal.Notify(hup, syscall.SIGHUP)
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-hup:
		case <-ticker.C:
			if os.Getenv("APP_CONFIGURATION_ENDPOINT") == "" && len(hup) == 0 {
				// File mode reloads on SIGHUP. The ticker still fires; a file
				// reload is cheap and picks up a replaced mount.
			}
		}
		set, err := load(ctx)
		if err != nil || set.Len() == 0 {
			logger.Error("project reload failed", "err", errString(err))
			continue
		}
		current.Store(set)
		validator.SetTenants(set.TenantIDs())
		logger.Info("projects reloaded", "projects", set.Len())
	}
}

func heartbeatLoop(ctx context.Context, svc *ingest.Service, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			svc.Heartbeat(ctx)
		}
	}
}

func serveTLS(ctx context.Context, addr string, cert tls.Certificate, handler http.Handler) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
		TLSConfig: &tls.Config{
			MinVersion:   tls.VersionTLS12,
			Certificates: []tls.Certificate{cert},
		},
	}
	errCh := make(chan error, 1)
	go func() {
		err := srv.ListenAndServeTLS("", "")
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
			return
		}
		close(errCh)
	}()
	select {
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		return srv.Shutdown(shutdown)
	case err := <-errCh:
		return err
	}
}

func retry(ctx context.Context, logger *slog.Logger, op string, fn func() error) error {
	deadline := time.Now().Add(5 * time.Minute)
	var last error
	for {
		err := fn()
		if err == nil {
			return nil
		}
		last = err
		logger.Warn("retrying", "op", op, "err", redact.Secrets(err.Error()))
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
	return redact.Secrets(err.Error())
}
