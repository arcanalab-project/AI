# Before Marketplace certification

Version 0.9 is the first shippable slice. It is not a certified Microsoft Sentinel solution and it has not been submitted to Partner Center. Do not publish this package as a Marketplace offer from the repository alone.

## Still required

- Prove an end-to-end private log path in the customer tenant. Atlas cannot originate a connection to the Private Link Service until MongoDB ships Private Link for OpenTelemetry export (CUSTOMER-I-10570), or until a supported forwarder is part of the offer. Public-CA DNS and the private zone for `otlpHostname` have to be in place on that path.
- Replace the token-publisher bridge when Atlas can obtain an Entra token with client credentials. Until then, a short-lived token still sits in the Atlas header between refreshes.
- Partner Center offer, publisher verification, support, and privacy terms, plus the screenshots the listing requires.
- `createUiDefinition` sandbox validation and the Azure Resource Manager template test toolkit. The committed template is compiled from `infra/main.bicep`; the toolkit has not been run.
- Image supply chain: a registry the customer trusts, scanning, and signing. The Dockerfile builds the two binaries. It does not sign them.
- Sentinel content certification: ASIM validator, tuned analytics, a workbook review, and the connected-solution state for a push connector. The files under `packaging/sentinel/` are starters. This package does not include a Codeless Connector Platform poller.
- An AMPLS cutover plan for any existing workspace that will be linked. Linking changes ingestion for the whole workspace.
- Operations: Azure Monitor Agent or syslog for the replicas, alerts, an SLA, a penetration test, data-residency review, and retention and cost planning. Atlas can export on the order of 1 GB per host per day.
- Entra consent and certificate rollover, executed in the customer tenant. The template does not create the applications.
- A load test with more than ten nodes and more than one project, including partial OTLP success and duplicate delivery.
- A license decision for the offer.
- Disable public network access on App Configuration after the seed script has run.
- A supported layout when the Sentinel workspace is in another resource group. Version 0.9 deploys the table, endpoint, and rule into the workspace resource group.
- Header budget and template size. Atlas allows about ten headers and 2 KB. `projectsConfigJson` is capped at 60,000 characters in the template. Larger estates should be seeded directly in App Configuration.
- One publisher identity per Entra tenant. Ingest already accepts an allowlist that spans tenants.
- Sovereign clouds. Signing keys are taken from the public Entra host only.

## What certification must not undo

Do not add a function-app poller, a single `group_id` parameter, or a workspace shared key in order to fit an older connector blade. Do not add a public OTLP listener as a fallback. Do not put the Atlas service-account secret, the Entra signing key, or an access token in parameters, custom data, or this repository.
