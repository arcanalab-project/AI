# Infrastructure

`main.bicep` is the deployment. `modules/` splits identity, network, Key Vault, monitor resources, and compute. `files/install.sh` starts the container on each machine. `files/seed-appconfig.sh` writes the project allowlist. `parameters.example.json` uses placeholders and is not a working deployment.

The template deploys into the resource group of the Sentinel workspace. It creates:

- two user-assigned identities and a separate seed identity
- a virtual network, NAT gateway, internal load balancer, and Private Link Service
- two Key Vaults with public network access disabled, RBAC, and private endpoints
- a Data Collection Endpoint with public access disabled, a Data Collection Rule, the `MongoDBAtlasLogs_CL` table, and an Azure Monitor Private Link Scope
- App Configuration, seeded by a deployment script, plus a private endpoint
- an ingest scale set (minimum 2) and one publisher virtual machine, both without public IPs

Build the ARM template with `make bicep` from the connector directory. The output is `packaging/marketplace/mainTemplate.json`.

Before a deployment can accept logs, the operator still has to:

1. Build and push the image from the connector Dockerfile. Grant AcrPull on that registry to both machine identities. The template does not assign that role, because the registry may live in another resource group.
2. Run `scripts/register-entra-api.sh` and upload the publisher certificate.
3. Put a public-CA PFX in the TLS vault under `tlsCertificateName`, and the Atlas service-account secret in the control vault under `atlasClientSecretName`.
4. Deploy with a real `projectsConfigJson`. The example ids will not match a tenant.
5. Approve the private endpoint that will originate the OTLP connection, and publish private DNS for `otlpHostname`.
6. Disable public access on App Configuration after the seed completes.

`createDedicatedWorkspace` creates a workspace, disables its public ingestion, onboards Sentinel, and links it to the private scope. Leave it false to use a workspace that already exists in this resource group. Set `linkWorkspaceToAmpls` only when that existing workspace should stop public ingestion.

SSH uses a public key parameter. The template has no password and no secret parameters. `projectsConfigJson` is passed to the seed script as a secure environment value because it is the allowlist, not because it is a credential. Do not put secrets in it.
