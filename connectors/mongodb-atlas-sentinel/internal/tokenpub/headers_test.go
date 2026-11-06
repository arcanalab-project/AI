package tokenpub

import (
	"strings"
	"testing"
)

func TestBuildHeadersRejectsStaticToken(t *testing.T) {
	if _, _, err := BuildHeaders("static-bearer-token", "6650aa001122334455667788"); err == nil {
		t.Fatal("expected rejection")
	}
}

func TestBuildHeadersOmitsGroupWhenTokenIsLarge(t *testing.T) {
	token := "aaa." + strings.Repeat("b", 1840) + ".ccc"
	headers, included, err := BuildHeaders(token, "6650aa001122334455667788")
	if err != nil {
		t.Fatal(err)
	}
	if included || len(headers) != 1 {
		t.Fatalf("included=%v headers=%d", included, len(headers))
	}
}

func TestBuildHeadersRejectsOversizedToken(t *testing.T) {
	token := "aaa." + strings.Repeat("b", 4000) + ".ccc"
	if _, _, err := BuildHeaders(token, "6650aa001122334455667788"); err == nil {
		t.Fatal("expected budget error")
	}
}
