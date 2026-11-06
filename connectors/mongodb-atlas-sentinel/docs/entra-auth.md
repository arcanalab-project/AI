# Entra ID authentication

The OTLP data plane accepts only Entra access tokens. A static bearer token is rejected. There is no configuration flag that turns static tokens on.

A token must be an RS256 JWT, version 2.0, issued by `https://login.microsoftonline.com/{tenant}/v2.0`, with an audience configured on the replica. The signing keys come from `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys`. The tenant id is taken from the token, checked against the project allowlist, and only then used to build that fixed URL. Clock skew is 60 seconds. Keys are cached for one hour and refreshed when the key id is unknown. The token must carry the app role `Logs.Ingest` or the custom delegated scope `Logs.Ingest`. The client id must be listed on the Atlas project. Failure is closed: the request is denied and the token is not logged.

`scripts/register-entra-api.sh` creates two applications in the operator's tenant: an API with application id URI `api://{appId}`, and a client application for the token publisher. The API defines app role `Logs.Ingest` (`a4c87cfc-a3bc-4a42-a6a6-3297ca667f34`) and custom scope `Logs.Ingest` (`e1c4679b-623b-4328-9dcd-a1351d977bd8`). The script assigns the role to the client service principal. It does not create a client secret.

The publisher authenticates to Entra with a certificate client assertion (`x5t` thumbprint, `urn:ietf:params:oauth:client-assertion-type:jwt-bearer`). The private key stays in the control Key Vault. The access token is checked with the ingest validator before it is written to Atlas. Tokens that are not JWTs, or that do not fit the Atlas header budget of about 1900 bytes, are refused. `X-Atlas-Group-Id` is added only when it still fits.

This is a bridge. Atlas stores the header value and sends it on each export. The publisher refreshes it about every 20 minutes, and not more often than every 5 minutes. A long-lived ingest secret is never placed in the header. Atlas cannot yet perform the client-credentials grant itself, so the header still holds a bearer token between refreshes. Treat the control vault, the publisher identity, and the Atlas service-account secret as production credentials.

The publisher serves one Entra tenant. Ingest can validate projects from several tenants in the same allowlist. Sovereign clouds are not configured; the signing-key host is the public Entra host.

The template does not create the Entra applications. Register them, grant admin consent, and upload the certificate before the publisher can install headers. The TLS certificate on the OTLP endpoint is a different certificate. It must be a public-CA certificate whose name matches `otlpHostname`, stored as a PFX secret in the TLS vault so the replica can terminate TLS. The Entra signing certificate should be non-exportable.
