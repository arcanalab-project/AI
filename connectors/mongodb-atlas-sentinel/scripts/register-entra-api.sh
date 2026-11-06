#!/usr/bin/env bash
# Registers the Entra application the connector uses for OTLP tokens.
# This script does not create a client secret and does not print certificate material.
# Run it with an identity that can create applications. Review the display names
# before running: the script updates the app role and scope arrays of those apps.
set -euo pipefail

APP_ROLE_ID="a4c87cfc-a3bc-4a42-a6a6-3297ca667f34"
SCOPE_ID="e1c4679b-623b-4328-9dcd-a1351d977bd8"
API_NAME="${API_NAME:-Atlas Sentinel Ingest API}"
CLIENT_NAME="${CLIENT_NAME:-Atlas Sentinel Token Publisher}"

command -v az >/dev/null
command -v python3 >/dev/null

app_id_for() {
  local name="$1"
  local id
  id="$(az ad app list --filter "displayName eq '${name}'" --query "[0].appId" -o tsv)"
  if [[ -z "${id}" ]]; then
    id="$(az ad app create --display-name "${name}" --sign-in-audience AzureADMyOrg --query appId -o tsv)"
  fi
  printf '%s\n' "${id}"
}

sp_id_for() {
  local app_id="$1"
  local id
  id="$(az ad sp list --filter "appId eq '${app_id}'" --query "[0].id" -o tsv)"
  if [[ -z "${id}" ]]; then
    id="$(az ad sp create --id "${app_id}" --query id -o tsv)"
  fi
  printf '%s\n' "${id}"
}

API_APP_ID="$(app_id_for "${API_NAME}")"
CLIENT_APP_ID="$(app_id_for "${CLIENT_NAME}")"

az ad app update --id "${API_APP_ID}" --identifier-uris "api://${API_APP_ID}" >/dev/null

API_OBJECT_ID="$(az ad app show --id "${API_APP_ID}" --query id -o tsv)"
PATCH_BODY="$(API_OBJECT_ID="${API_OBJECT_ID}" APP_ROLE_ID="${APP_ROLE_ID}" SCOPE_ID="${SCOPE_ID}" python3 - <<'PY'
import json, os
print(json.dumps({
  "api": {
    "requestedAccessTokenVersion": 2,
    "oauth2PermissionScopes": [{
      "adminConsentDescription": "Ingest MongoDB Atlas logs into Microsoft Sentinel.",
      "adminConsentDisplayName": "Ingest Atlas logs",
      "id": os.environ["SCOPE_ID"],
      "isEnabled": True,
      "type": "Admin",
      "userConsentDescription": "Ingest MongoDB Atlas logs into Microsoft Sentinel.",
      "userConsentDisplayName": "Ingest Atlas logs",
      "value": "Logs.Ingest"
    }]
  },
  "appRoles": [{
    "allowedMemberTypes": ["Application"],
    "description": "Ingest MongoDB Atlas logs into Microsoft Sentinel.",
    "displayName": "Ingest Atlas logs",
    "id": os.environ["APP_ROLE_ID"],
    "isEnabled": True,
    "origin": "Application",
    "value": "Logs.Ingest"
  }]
}))
PY
)"

az rest --method PATCH \
  --uri "https://graph.microsoft.com/v1.0/applications/${API_OBJECT_ID}" \
  --headers "Content-Type=application/json" \
  --body "${PATCH_BODY}" >/dev/null

API_SP_ID="$(sp_id_for "${API_APP_ID}")"
CLIENT_SP_ID="$(sp_id_for "${CLIENT_APP_ID}")"

ASSIGNED="$(az rest --method GET \
  --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${CLIENT_SP_ID}/appRoleAssignments" \
  | APP_ROLE_ID="${APP_ROLE_ID}" API_SP_ID="${API_SP_ID}" python3 -c 'import json,os,sys; rows=json.load(sys.stdin).get("value", []); print(any(r.get("appRoleId")==os.environ["APP_ROLE_ID"] and r.get("resourceId")==os.environ["API_SP_ID"] for r in rows))')"

if [[ "${ASSIGNED}" != "True" ]]; then
  az rest --method POST \
    --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${CLIENT_SP_ID}/appRoleAssignments" \
    --headers "Content-Type=application/json" \
    --body "{\"principalId\":\"${CLIENT_SP_ID}\",\"resourceId\":\"${API_SP_ID}\",\"appRoleId\":\"${APP_ROLE_ID}\"}" >/dev/null
fi

cat <<EOF
Entra apps are registered. No client secret was created.

Audience: api://${API_APP_ID}
Publisher client id: ${CLIENT_APP_ID}
App role and custom scope: Logs.Ingest

Upload the publisher certificate yourself. Do not add a password credential:
  az ad app credential reset --id ${CLIENT_APP_ID} --cert @cert.pem --append

Import that certificate into the control Key Vault as a non-exportable key.
Store the Atlas service account secret as a separate Key Vault secret.
This script does not set either value.
EOF
