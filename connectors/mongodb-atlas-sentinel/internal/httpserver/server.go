// Package httpserver is the OTLP/HTTP front door.
package httpserver

import (
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/auth"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/ingest"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/otlp"
)

// Server authenticates Entra bearers and forwards OTLP log exports.
type Server struct {
	Validator *auth.Validator
	Ingest    *ingest.Service
	Logger    *slog.Logger
	Version   string
	Projects  func() int
	MaxBody   int64
}

// Handler is the HTTP router. Health checks do not require a token and return
// no log data.
func (s *Server) Handler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.serve(w, r, true)
	})
}

// HealthHandler exposes only process health. The OTLP route is not mounted,
// so the load-balancer probe port cannot accept log exports.
func (s *Server) HealthHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.serve(w, r, false)
	})
}

func (s *Server) serve(w http.ResponseWriter, r *http.Request, logs bool) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "no-store")
	switch {
	case r.URL.Path == "/healthz" && r.Method == http.MethodGet:
		s.health(w, true)
	case r.URL.Path == "/readyz" && r.Method == http.MethodGet:
		s.health(w, s.Projects != nil && s.Projects() > 0)
	case logs && (r.URL.Path == "/v1/logs" || r.URL.Path == "/v1/logs/") && r.Method == http.MethodPost:
		s.logs(w, r)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) health(w http.ResponseWriter, ready bool) {
	status := http.StatusOK
	state := "ok"
	if !ready {
		status = http.StatusServiceUnavailable
		state = "not-ready"
	}
	projects := 0
	if s.Projects != nil {
		projects = s.Projects()
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": state, "version": s.Version, "projects": projects})
}

func (s *Server) logs(w http.ResponseWriter, r *http.Request) {
	requestID := newID()
	w.Header().Set("X-Request-Id", requestID)
	raw, err := bearer(r.Header.Get("Authorization"))
	if err != nil {
		s.fail(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	principal, err := s.Validator.Validate(r.Context(), raw)
	if err != nil {
		if s.Logger != nil {
			s.Logger.Warn("token rejected", "requestId", requestID, "reason", auth.FormatReason(err))
		}
		w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
		s.fail(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	body, err := readBody(w, r, s.maxBody())
	if err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) || errors.Is(err, errTooLarge) {
			s.fail(w, http.StatusRequestEntityTooLarge, "payload too large")
			return
		}
		if errors.Is(err, errEncoding) {
			s.fail(w, http.StatusUnsupportedMediaType, "unsupported content encoding")
			return
		}
		s.fail(w, http.StatusBadRequest, "invalid body")
		return
	}
	result := s.Ingest.Ingest(r.Context(), ingest.Request{
		ContentType: r.Header.Get("Content-Type"),
		Body:        body,
		Principal:   principal,
		GroupHeader: r.Header.Get("X-Atlas-Group-Id"),
	})
	if s.Logger != nil {
		s.Logger.Info("export", "requestId", requestID, "status", result.Status, "accepted", result.Accepted, "rejected", result.Rejected, "clientId", principal.ClientID)
	}
	if result.Status != http.StatusOK {
		s.fail(w, result.Status, result.Message)
		return
	}
	payload, ctype, err := otlp.ResponseBody(r.Header.Get("Content-Type"), int64(result.Rejected), result.Message)
	if err != nil {
		s.fail(w, http.StatusInternalServerError, "response encoding failed")
		return
	}
	w.Header().Set("Content-Type", ctype)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(payload)
}

func (s *Server) fail(w http.ResponseWriter, status int, message string) {
	if message == "" {
		message = http.StatusText(status)
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (s *Server) maxBody() int64 {
	if s.MaxBody > 0 {
		return s.MaxBody
	}
	return 8 << 20
}

var (
	errTooLarge = errors.New("too large")
	errEncoding = errors.New("encoding")
)

func bearer(header string) (string, error) {
	if header == "" {
		return "", errors.New("missing")
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") || strings.TrimSpace(parts[1]) == "" {
		return "", errors.New("missing")
	}
	return strings.TrimSpace(parts[1]), nil
}

func readBody(w http.ResponseWriter, r *http.Request, max int64) ([]byte, error) {
	r.Body = http.MaxBytesReader(w, r.Body, max)
	var reader io.Reader = r.Body
	switch strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Encoding"))) {
	case "", "identity":
	case "gzip":
		gz, err := gzip.NewReader(r.Body)
		if err != nil {
			return nil, err
		}
		defer gz.Close()
		reader = gz
	default:
		return nil, errEncoding
	}
	body, err := io.ReadAll(io.LimitReader(reader, max+1))
	if err != nil {
		return nil, err
	}
	if int64(len(body)) > max {
		return nil, errTooLarge
	}
	return body, nil
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// Listen starts the HTTP server and returns when ctx is cancelled.
func Listen(ctx context.Context, addr string, handler http.Handler, tlsCertFile, tlsKeyFile string) error {
	srv := &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errCh := make(chan error, 1)
	go func() {
		var err error
		if tlsCertFile == "" {
			err = srv.ListenAndServe()
		} else {
			err = srv.ListenAndServeTLS(tlsCertFile, tlsKeyFile)
		}
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}
