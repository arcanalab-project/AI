#!/bin/bash
# Installs the ingest or token-publisher container on a VM that has a managed
# identity. The script does not print tokens.
set -euo pipefail

ENV_FILE="${1:?env file}"
ROLE="${2:?role}"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -n "${PROJECTS_CONFIG_PATH:-}" && -f "${PROJECTS_CONFIG_PATH}" ]]; then
  python3 -m json.tool "$PROJECTS_CONFIG_PATH" >/dev/null
fi

systemctl enable --now docker
for _ in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker info >/dev/null

REGISTRY="${INGEST_IMAGE%%/*}"
if [[ "$REGISTRY" == *.azurecr.io ]]; then
  if [[ -z "${AZURE_CLIENT_ID:-}" ]]; then
    echo "AZURE_CLIENT_ID is required to pull from Azure Container Registry" >&2
    exit 1
  fi
  META="http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https://containerregistry.azure.net&client_id=${AZURE_CLIENT_ID}"
  ACCESS="$(curl -sS -H Metadata:true "$META" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
  printf '%s' "$ACCESS" | docker login "$REGISTRY" -u 00000000-0000-0000-0000-000000000000 --password-stdin >/dev/null
  unset ACCESS
fi

docker pull "$INGEST_IMAGE"

if [[ "$ROLE" == "publisher" ]]; then
  NAME="atlas-sentinel-token-publisher"
  ENTRY="--entrypoint /atlas-sentinel-token-publisher"
else
  NAME="atlas-sentinel-ingest"
  ENTRY=""
fi

cat >/etc/systemd/system/${NAME}.service <<EOF
[Unit]
Description=MongoDB Atlas Sentinel ${ROLE}
After=docker.service network-online.target
Requires=docker.service

[Service]
Restart=always
RestartSec=5
ExecStartPre=-/usr/bin/docker rm -f ${NAME}
ExecStart=/usr/bin/docker run --name ${NAME} --network host --env-file ${ENV_FILE} ${ENTRY} ${INGEST_IMAGE}
ExecStop=/usr/bin/docker stop ${NAME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$NAME"
