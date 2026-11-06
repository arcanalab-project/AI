# Packaging

This directory is the input for a later Marketplace and Sentinel content review. Nothing here is certified, and nothing here is published.

## Marketplace

`marketplace/createUiDefinition.json` is the portal wizard. `marketplace/mainTemplate.json` is the compiled form of `infra/main.bicep`. Regenerate it with `make bicep` after a template change and commit both files together. The wizard collects identifiers, the image reference, the OTLP hostname, and an SSH public key. It does not collect a client secret or a certificate.

The Azure portal sandbox and the ARM template test toolkit have not been run. See `docs/marketplace-certification.md`.

## Sentinel content

`sentinel/` holds starter Kusto, two scheduled-query texts, a sample row, and a workbook. They are not a Content Hub solution. Import the parser as a function, then save the analytic queries as scheduled rules in the workspace, after the table exists. The parser drops `connector-heartbeat` so connector health is not treated as Atlas audit data.

There is no Codeless Connector Platform poller and no Function App in this package. A push connector does not discover logs by polling Atlas.
