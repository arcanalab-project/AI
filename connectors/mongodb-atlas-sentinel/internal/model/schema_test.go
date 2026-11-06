package model

import (
	"os"
	"strings"
	"testing"
)

func TestBicepTableDeclaresEveryColumn(t *testing.T) {
	body, err := os.ReadFile("../../infra/modules/monitor.bicep")
	if err != nil {
		t.Fatal(err)
	}
	text := string(body)
	for _, col := range ColumnNames() {
		if !strings.Contains(text, "'"+col+"'") && !strings.Contains(text, "\""+col+"\"") {
			t.Errorf("monitor.bicep does not declare column %s", col)
		}
	}
}

func TestNetworkPublishesOnlyTheNatAddress(t *testing.T) {
	body, err := os.ReadFile("../../infra/modules/network.bicep")
	if err != nil {
		t.Fatal(err)
	}
	text := string(body)
	if strings.Count(text, "Microsoft.Network/publicIPAddresses@") != 1 {
		t.Fatalf("expected one public IP resource for NAT egress, found the declaration %d times", strings.Count(text, "Microsoft.Network/publicIPAddresses@"))
	}
	if strings.Contains(text, "publicIPAddress:") {
		t.Fatal("load balancer must not reference a public IP")
	}
}
