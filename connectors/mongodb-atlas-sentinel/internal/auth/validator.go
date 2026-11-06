// Package auth validates Microsoft Entra access tokens for the OTLP ingest path.
// A shared secret or a non-JWT bearer is never accepted.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ErrUnauthenticated is the sentinel for a rejected bearer token.
var ErrUnauthenticated = errors.New("unauthenticated")

// Rejection is a safe reason code. It must not contain the token.
type Rejection struct {
	Reason string
}

func (r *Rejection) Error() string {
	if r == nil || r.Reason == "" {
		return "unauthenticated"
	}
	return r.Reason
}

func (r *Rejection) Unwrap() error { return ErrUnauthenticated }

func reject(reason string) error { return &Rejection{Reason: reason} }

// Principal is the authenticated Atlas exporter.
type Principal struct {
	TenantID string
	ClientID string
	Roles    []string
	Scopes   []string
}

// Validator checks signature, issuer, audience, and the custom role or scope.
type Validator struct {
	audiences     []string
	requiredRole  string
	requiredScope string
	keys          *Provider
	tenants       atomic.Pointer[map[string]struct{}]
	now           func() time.Time
}

// NewValidator builds a validator. baseURL is the Entra host, without a tenant path.
// Tests pass a local host. Production uses https://login.microsoftonline.com.
func NewValidator(baseURL string, audiences []string, requiredRole, requiredScope string) (*Validator, error) {
	if strings.TrimSpace(baseURL) == "" {
		return nil, errors.New("entra base url is required")
	}
	if len(audiences) == 0 || strings.TrimSpace(audiences[0]) == "" {
		return nil, errors.New("at least one entra audience is required")
	}
	if strings.TrimSpace(requiredRole) == "" && strings.TrimSpace(requiredScope) == "" {
		return nil, errors.New("a required app role or custom scope is required")
	}
	clean := make([]string, 0, len(audiences))
	for _, a := range audiences {
		a = strings.TrimSpace(a)
		if a != "" {
			clean = append(clean, a)
		}
	}
	v := &Validator{
		audiences:     clean,
		requiredRole:  requiredRole,
		requiredScope: requiredScope,
		keys:          NewProvider(strings.TrimRight(baseURL, "/")),
		now:           time.Now,
	}
	empty := map[string]struct{}{}
	v.tenants.Store(&empty)
	return v, nil
}

// SetTenants replaces the tenant allowlist. JWKS is fetched only for these tenants.
func (v *Validator) SetTenants(ids []string) {
	next := make(map[string]struct{}, len(ids))
	for _, id := range ids {
		id = strings.ToLower(strings.TrimSpace(id))
		if id != "" {
			next[id] = struct{}{}
		}
	}
	v.tenants.Store(&next)
}

// Validate returns the caller identity or a Rejection.
func (v *Validator) Validate(ctx context.Context, raw string) (Principal, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || strings.Count(raw, ".") != 2 {
		return Principal{}, reject("malformed")
	}
	var peek accessClaims
	if _, _, err := jwt.NewParser().ParseUnverified(raw, &peek); err != nil {
		return Principal{}, reject("malformed")
	}
	tid := strings.ToLower(strings.TrimSpace(peek.Tid))
	if tid == "" {
		return Principal{}, reject("missing-tenant")
	}
	allowed := v.tenants.Load()
	if allowed == nil {
		return Principal{}, reject("unknown-tenant")
	}
	if _, ok := (*allowed)[tid]; !ok {
		return Principal{}, reject("unknown-tenant")
	}

	claims := accessClaims{}
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodRS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(60*time.Second),
		jwt.WithTimeFunc(v.now),
	)
	_, err := parser.ParseWithClaims(raw, &claims, func(t *jwt.Token) (any, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, reject("missing-kid")
		}
		if t.Method == nil || t.Method.Alg() != jwt.SigningMethodRS256.Alg() {
			return nil, reject("unexpected-alg")
		}
		return v.keys.PublicKey(ctx, tid, kid)
	})
	if err != nil {
		var rej *Rejection
		if errors.As(err, &rej) {
			return Principal{}, rej
		}
		if errors.Is(err, jwt.ErrTokenExpired) {
			return Principal{}, reject("expired")
		}
		return Principal{}, reject("bad-signature")
	}
	if !strings.EqualFold(claims.Tid, tid) {
		return Principal{}, reject("tenant-mismatch")
	}
	if claims.Ver != "2.0" {
		return Principal{}, reject("unsupported-version")
	}
	wantIss := "https://login.microsoftonline.com/" + claims.Tid + "/v2.0"
	if claims.Issuer != wantIss {
		return Principal{}, reject("issuer")
	}
	if !audienceOK(claims.Audience, v.audiences) {
		return Principal{}, reject("audience")
	}
	roles := parseStringList(claims.Roles)
	scopes := strings.Fields(claims.Scp)
	if !permissionOK(roles, scopes, v.requiredRole, v.requiredScope) {
		return Principal{}, reject("missing-permission")
	}
	clientID := strings.ToLower(claims.Azp)
	if clientID == "" {
		clientID = strings.ToLower(claims.AppID)
	}
	if clientID == "" {
		return Principal{}, reject("missing-client")
	}
	return Principal{
		TenantID: strings.ToLower(claims.Tid),
		ClientID: clientID,
		Roles:    roles,
		Scopes:   scopes,
	}, nil
}

type accessClaims struct {
	jwt.RegisteredClaims
	Tid   string          `json:"tid"`
	Roles json.RawMessage `json:"roles"`
	Scp   string          `json:"scp"`
	Azp   string          `json:"azp"`
	AppID string          `json:"appid"`
	Ver   string          `json:"ver"`
}

func audienceOK(got jwt.ClaimStrings, want []string) bool {
	for _, g := range got {
		for _, w := range want {
			if g == w {
				return true
			}
		}
	}
	return false
}

func permissionOK(roles, scopes []string, role, scope string) bool {
	if role != "" {
		for _, r := range roles {
			if r == role {
				return true
			}
		}
	}
	if scope != "" {
		for _, s := range scopes {
			if s == scope {
				return true
			}
		}
	}
	return false
}

func parseStringList(raw json.RawMessage) []string {
	if len(raw) == 0 {
		return nil
	}
	var one string
	if err := json.Unmarshal(raw, &one); err == nil {
		if one == "" {
			return nil
		}
		return []string{one}
	}
	var many []string
	if err := json.Unmarshal(raw, &many); err != nil {
		return nil
	}
	return many
}

// HasRole reports whether the principal was granted the application role.
func HasRole(p Principal, role string) bool {
	for _, r := range p.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// FormatReason unwraps a rejection reason for logs.
func FormatReason(err error) string {
	var rej *Rejection
	if errors.As(err, &rej) {
		return rej.Reason
	}
	return "unauthenticated"
}

// StaticBearerRejected is used by tests and the publisher to describe a non-JWT.
func StaticBearerRejected(raw string) error {
	if strings.Count(strings.TrimSpace(raw), ".") != 2 {
		return fmt.Errorf("%w: static bearer", ErrUnauthenticated)
	}
	return nil
}
