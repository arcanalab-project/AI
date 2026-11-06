package redact

import "testing"

func TestSecrets(t *testing.T) {
	in := "failed Authorization=Bearer aaa.bbb.ccc secret=atlas-test-secret-value"
	out := Secrets(in, "atlas-test-secret-value")
	if out == in || containsAny(out, "aaa.bbb.ccc", "atlas-test-secret-value") {
		t.Fatalf("secret leaked: %s", out)
	}
}

func containsAny(s string, parts ...string) bool {
	for _, p := range parts {
		if len(p) > 0 && contains(s, p) {
			return true
		}
	}
	return false
}

func contains(s, part string) bool {
	return len(s) >= len(part) && (s == part || len(part) == 0 || indexOf(s, part) >= 0)
}

func indexOf(s, part string) int {
	for i := 0; i+len(part) <= len(s); i++ {
		if s[i:i+len(part)] == part {
			return i
		}
	}
	return -1
}
