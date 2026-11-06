# Multiple projects and tenants

One deployment serves many Atlas projects. The Marketplace proof of concept asked for one `group_id` and at most ten cluster ids in the portal blade. This connector does not take that shape.

Each project record contains:

- `atlasGroupId`, 24 hex characters
- `entraTenantId` and `allowedClientIds`, as GUIDs
- optional `atlasOrgId`, which must match the log record when both are present
- optional `logIntegrationId` for the publisher
- optional `logTypes`: `MONGOD`, `MONGOS`, `MONGOD_AUDIT`, `MONGOS_AUDIT`, `EVENTS` (all five when omitted)
- optional `enabled` (true when omitted)
- optional `sink`; otherwise the deployment Data Collection Endpoint and rule

`config/projects.example.yaml` shows two projects, one with its own sink and one that inherits the default. `config/projects.schema.json` is the JSON Schema. The deployment parameter `projectsConfigJson` is the same document as a single JSON object. It is identifiers only. The seed script refuses a document that contains a private key, `client_secret=`, or `AccountKey=`.

Limits in the loader: 5000 projects, and 1 MiB for a local file. App Configuration is the runtime source because a virtual-machine custom-data payload is capped and does not change without a reimage. One key per project stays under the App Configuration value size. There is no catch-all workspace: a group id that is not in the allowlist is rejected, and none of its records are stored.

The group id on the resource attribute, the record attribute, and the `X-Atlas-Group-Id` header must agree when more than one is present. The project display name written to Sentinel comes from the allowlist, not from the client.

Changing the allowlist means updating `projectsConfigJson` and redeploying, or writing the App Configuration keys with the same shape. Replicas reload the store about once a minute and on `SIGHUP`.

The publisher writes headers only for projects in its Entra tenant that already have a `logIntegrationId`. Other projects are left unchanged. Run the publisher once with `-bootstrap` to create the missing Atlas integrations and record the ids it prints.
