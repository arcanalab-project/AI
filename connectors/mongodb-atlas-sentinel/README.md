# MongoDB Atlas connector for Microsoft Sentinel

Version 0.9 is a push connector for Atlas OpenTelemetry log export. Atlas projects send logs to a private OTLP endpoint. The connector checks a Microsoft Entra token, matches the Atlas project, and writes the batch to a Sentinel custom table through the Logs Ingestion API.

It is not the Marketplace solution `MongoDBAtlas` 3.0.8. That package is a single-function poller for one Atlas project and at most ten clusters. Microsoft Support case 01610194 told the customer to fork and maintain that proof of concept. This package replaces that shape instead of extending it.

Nothing in this repository is published to Azure Marketplace.

## What a deployment does

- Accepts OTLP HTTP JSON and protobuf from many Atlas projects, on a scale set of at least two replicas.
- Allows more than one Entra tenant on the ingest path, with an allowlist of client applications per project.
- Exposes the receiver only through an Azure Private Link Service and an internal load balancer. There is no public OTLP listener.
- Sends logs to Azure Monitor over a private endpoint. A dedicated workspace is created with public ingestion disabled. An existing workspace is left unchanged unless the deployment is told to link it.
- Installs a short-lived Entra access token into the Atlas log integration. The token is obtained with a certificate client assertion. Static bearer tokens are rejected. Secrets stay in Key Vault and are not parameters.

Atlas cannot originate the Private Link connection today. Feature request CUSTOMER-I-10570 is still open. The Azure side is deployed so it can be approved when that path, or a customer forwarder, exists. The trade-off is documented in [docs/private-link.md](docs/private-link.md). The Entra header bridge is documented in [docs/entra-auth.md](docs/entra-auth.md).

## Layout

| Path | Role |
| --- | --- |
| `cmd/atlas-sentinel-ingest` | OTLP receiver |
| `cmd/atlas-sentinel-token-publisher` | Refreshes the Entra token on each Atlas project |
| `internal/auth` | Entra JWT validation |
| `internal/config` | Multi-project allowlist |
| `internal/otlp`, `internal/normalize`, `internal/ingest` | Decode, shape, and upload |
| `infra/` | Bicep for the private deployment |
| `config/` | Example allowlist and JSON Schema |
| `packaging/` | Wizard, compiled template, and starter Sentinel content |
| `docs/` | Architecture and the certification gap |

## Build

Go 1.26 is required by the current Azure SDK.

```bash
go test ./...
make bicep
```

The container image contains both binaries. The default entrypoint is the ingest process. The publisher virtual machine overrides the entrypoint.

```bash
docker build -t atlas-sentinel-ingest:0.9.0 .
```

`scripts/register-entra-api.sh` registers the API and the publisher application. It does not create a client secret. Run it only in a tenant where you intend to create those apps.

Deployment steps and the values the template will not ask for are in [infra/README.md](infra/README.md). What remains before a Marketplace offer is in [docs/marketplace-certification.md](docs/marketplace-certification.md).
