// Package redact keeps bearer tokens and other credentials out of logs.
package redact

import (
	"regexp"
	"strings"
)

var bearer = regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*`)

// Secrets replaces bearer tokens and any extra secret values.
func Secrets(s string, extra ...string) string {
	s = bearer.ReplaceAllString(s, "Bearer [redacted]")
	for _, e := range extra {
		if len(e) < 8 {
			continue
		}
		s = strings.ReplaceAll(s, e, "[redacted]")
	}
	return s
}
