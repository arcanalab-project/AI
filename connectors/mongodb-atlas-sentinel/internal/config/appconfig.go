package config

import (
	"context"
	"fmt"
	"strings"

	"github.com/Azure/azure-sdk-for-go/sdk/azcore"
	"github.com/Azure/azure-sdk-for-go/sdk/azcore/to"
	"github.com/Azure/azure-sdk-for-go/sdk/data/azappconfig"
	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/model"
)

// KeyPrefix is the App Configuration key prefix for one JSON project per key.
const KeyPrefix = "atlas-sentinel/project/"

// ValueLister returns project JSON documents.
type ValueLister interface {
	Values(ctx context.Context) ([]string, error)
}

// AzureLister reads project documents from App Configuration.
type AzureLister struct {
	Client *azappconfig.Client
}

// NewAzureLister builds a data-plane client that uses the caller credential.
// No connection string is accepted.
func NewAzureLister(endpoint string, cred azcore.TokenCredential) (*AzureLister, error) {
	client, err := azappconfig.NewClient(endpoint, cred, nil)
	if err != nil {
		return nil, err
	}
	return &AzureLister{Client: client}, nil
}

// Values lists every project JSON document under KeyPrefix.
func (l *AzureLister) Values(ctx context.Context) ([]string, error) {
	if l == nil || l.Client == nil {
		return nil, fmt.Errorf("app configuration client is nil")
	}
	pager := l.Client.NewListSettingsPager(azappconfig.SettingSelector{
		KeyFilter:   to.Ptr(KeyPrefix + "*"),
		LabelFilter: to.Ptr("\x00"),
	}, nil)
	var values []string
	for pager.More() {
		page, err := pager.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		for _, setting := range page.Settings {
			if setting.Key == nil || setting.Value == nil {
				continue
			}
			if !strings.HasPrefix(*setting.Key, KeyPrefix) {
				continue
			}
			values = append(values, *setting.Value)
		}
	}
	return values, nil
}

// LoadRemote parses an allowlist from a lister.
func LoadRemote(ctx context.Context, lister ValueLister, defaultSink model.Sink) (*Set, error) {
	values, err := lister.Values(ctx)
	if err != nil {
		return nil, err
	}
	if len(values) == 0 {
		return nil, fmt.Errorf("app configuration returned no projects")
	}
	return ParseProjectValues(values, defaultSink)
}
