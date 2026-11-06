// Package tokenpub places a short-lived Entra access token on an Atlas
// OpenTelemetry integration. Atlas stores headers, so this is a bridge until
// Atlas can perform the client-credentials grant itself.
package tokenpub

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/arcanalab-project/AI/connectors/mongodb-atlas-sentinel/internal/atlasapi"
)

// headerBudget stays under Atlas's 2KB combined header limit.
const headerBudget = 1900

// BuildHeaders returns the Authorization header and, when it fits, the group id.
// The token must already be an Entra JWT. A static secret is refused.
func BuildHeaders(entraToken, groupID string) (headers []atlasapi.Header, includedGroup bool, err error) {
	entraToken = strings.TrimSpace(entraToken)
	if strings.Count(entraToken, ".") != 2 {
		return nil, false, fmt.Errorf("refusing to publish a token that is not a JWT")
	}
	authz := []atlasapi.Header{{Name: "Authorization", Value: "Bearer " + entraToken}}
	withGroup := append([]atlasapi.Header{}, authz...)
	withGroup = append(withGroup, atlasapi.Header{Name: atlasapi.GroupHeader, Value: groupID})
	if size(withGroup) <= headerBudget {
		return withGroup, true, nil
	}
	if size(authz) <= headerBudget {
		return authz, false, nil
	}
	return nil, false, fmt.Errorf("entra token is %d bytes and exceeds the Atlas header budget", size(authz))
}

func size(headers []atlasapi.Header) int {
	b, err := json.Marshal(headers)
	if err != nil {
		return headerBudget + 1
	}
	return len(b)
}
