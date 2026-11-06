package auth

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"regexp"
	"sync"
	"time"
)

var guidPattern = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// Provider caches Entra signing keys. The tenant id is constrained to a GUID
// and concatenated onto a fixed host so the fetch cannot be pointed at an
// arbitrary URL.
type Provider struct {
	BaseURL string
	Client  *http.Client
	mu      sync.Mutex
	cache   map[string]keySet
}

type keySet struct {
	byKid map[string]*rsa.PublicKey
	at    time.Time
}

type jwksDoc struct {
	Keys []jwk `json:"keys"`
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Use string `json:"use"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// NewProvider returns a provider for one Entra cloud host.
func NewProvider(baseURL string) *Provider {
	return &Provider{
		BaseURL: baseURL,
		Client: &http.Client{
			Timeout: 5 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 3 {
					return fmt.Errorf("too many redirects")
				}
				if req.URL.Host != via[0].URL.Host {
					return fmt.Errorf("redirect host changed")
				}
				return nil
			},
		},
		cache: map[string]keySet{},
	}
}

// PublicKey returns the RSA key for a tenant and kid, refreshing once on a miss.
func (p *Provider) PublicKey(ctx context.Context, tenant, kid string) (*rsa.PublicKey, error) {
	if !guidPattern.MatchString(tenant) {
		return nil, reject("invalid-tenant")
	}
	p.mu.Lock()
	cached, ok := p.cache[stringsLower(tenant)]
	if ok && time.Since(cached.at) < time.Hour {
		if key, found := cached.byKid[kid]; found {
			p.mu.Unlock()
			return key, nil
		}
	}
	p.mu.Unlock()

	keys, err := p.fetch(ctx, tenant)
	if err != nil {
		return nil, err
	}
	key, found := keys[kid]
	if !found {
		return nil, reject("unknown-kid")
	}
	return key, nil
}

func (p *Provider) fetch(ctx context.Context, tenant string) (map[string]*rsa.PublicKey, error) {
	url := p.BaseURL + "/" + tenant + "/discovery/v2.0/keys"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, reject("jwks-unavailable")
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, reject("jwks-unavailable")
	}
	var doc jwksDoc
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return nil, reject("jwks-unavailable")
	}
	keys := map[string]*rsa.PublicKey{}
	for _, k := range doc.Keys {
		if k.Kty != "RSA" || k.Kid == "" || k.N == "" {
			continue
		}
		if k.Use != "" && k.Use != "sig" {
			continue
		}
		if k.Alg != "" && k.Alg != "RS256" {
			continue
		}
		pub, err := rsaKey(k)
		if err != nil {
			continue
		}
		keys[k.Kid] = pub
	}
	p.mu.Lock()
	p.cache[stringsLower(tenant)] = keySet{byKid: keys, at: time.Now()}
	p.mu.Unlock()
	return keys, nil
}

func rsaKey(k jwk) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, err
	}
	e := k.E
	if e == "" {
		e = "AQAB"
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(e)
	if err != nil {
		return nil, err
	}
	eInt := 0
	for _, b := range eBytes {
		eInt = eInt<<8 | int(b)
	}
	if eInt == 0 {
		return nil, fmt.Errorf("bad exponent")
	}
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: eInt}, nil
}

func stringsLower(s string) string {
	return guidFold(s)
}

func guidFold(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + ('a' - 'A')
		}
	}
	return string(b)
}
