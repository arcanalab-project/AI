# Private Link

The deployment creates the provider side of Private Link for the OTLP endpoint:

- a dedicated virtual network
- an internal load balancer with a private frontend only
- a Private Link Service on its own subnet, with private link policies disabled
- private endpoints for Key Vault, App Configuration, and Azure Monitor
- private DNS zones linked to that network

There is no parameter that opens a public OTLP listener. The only public IP is the NAT gateway. Virtual machines have no public address and no inbound SSH rule. The network security group allows Azure Load Balancer probes and virtual-network traffic to ports 8080 and 8443, then denies other inbound traffic.

## What Atlas can reach today

Atlas Private Link is a connection from the customer network into Atlas. Atlas does not dial back out over that link. OpenTelemetry log export currently needs a public-CA HTTPS endpoint. MongoDB feature request CUSTOMER-I-10570 asks for Private Link on that export and is not a shipped product. Deploying this template does not make Atlas send logs over a private path by itself.

The template still builds the Azure side so the private endpoint can be approved when Atlas, or a customer-operated forwarder in a peered network, can originate the connection. The current subscription is visible and auto-approved so the customer can test a private endpoint from their own subscription. MongoDB subscription ids are left off the auto-approval list until they are known. Add them with `privateLinkVisibleSubscriptionIds` and `privateLinkAutoApproveSubscriptionIds`.

The TLS certificate must be issued by a public CA and match `otlpHostname`. Atlas rejects a self-signed certificate. Private DNS for that name, on the path Atlas or the forwarder uses, is part of the customer cutover and is not created by this template.

## Logs Ingestion path

The Data Collection Endpoint is created with public network access disabled. An Azure Monitor Private Link Scope sets ingestion to PrivateOnly and is linked to that endpoint. A dedicated workspace is also linked, and its public ingestion is disabled. An existing workspace is not linked unless `linkWorkspaceToAmpls` is true, because linking it can stop public ingestion for every other collector on that workspace. This template does not change `publicNetworkAccessForIngestion` on a workspace it did not create.

Query access stays open unless `lockQueryToPrivateLink` is true, so the Azure portal can still run Kusto against a dedicated workspace.

The private DNS zones include the Azure Monitor zones, including the blob zone. They are linked only to the connector virtual network. Do not peer that network into a general-purpose network without planning the blob zone, which can intercept other storage lookups.

## App Configuration

The scale set reads the allowlist through a private endpoint. The store's public access stays enabled because the deployment script that seeds it runs outside the virtual network. After the seed succeeds, disable public access on the store before treating the deployment as production. That step is not automatic in 0.9.

## Egress

NAT egress is required for Entra token signing keys, the Atlas Admin API, and pulling the container image. That egress is not a log-ingest path. Ingest replicas upload logs only to the private Data Collection Endpoint.
