targetScope = 'resourceGroup'

@description('Region for the connector resources. A dedicated workspace is created here. An existing workspace must already be in this region.')
param location string = resourceGroup().location

@description('Short prefix for resource names.')
@maxLength(20)
param namePrefix string = 'atlas-sentinel'

@description('Tags applied to connector resources.')
param tags object = {}

@description('Log Analytics workspace name in this resource group. Created when createDedicatedWorkspace is true.')
param workspaceName string

@description('Create a workspace for Atlas logs and onboard Microsoft Sentinel. Use this when the existing workspace still receives other data over the public ingestion path.')
param createDedicatedWorkspace bool = false

@description('Also link an existing workspace to the private ingestion scope. This can stop public ingestion for every collector on that workspace.')
param linkWorkspaceToAmpls bool = false

@description('When true, queries to a dedicated workspace require Private Link. Leave false so the Azure portal can query.')
param lockQueryToPrivateLink bool = false

@minValue(30)
@maxValue(730)
param retentionInDays int = 90

@description('Project allowlist JSON. Identifiers only. No secrets, tokens, or certificates.')
@minLength(2)
@maxLength(60000)
param projectsConfigJson string

@description('Entra application ID URI accepted on the OTLP token, usually api://<app-id>.')
param entraAudience string

@description('Entra tenant that issues the token the publisher installs.')
param entraTenantId string

@description('Entra application id of the publisher client. It must be listed in allowedClientIds.')
param entraClientId string

param requiredRole string = 'Logs.Ingest'
param requiredScope string = 'Logs.Ingest'

@description('Name of the public-CA TLS certificate in the TLS Key Vault. Not the certificate itself.')
param tlsCertificateName string

@description('Name of the Entra client certificate in the control Key Vault. Not the certificate itself.')
param entraCertificateName string

@description('Atlas service account client id used only by the token publisher.')
param atlasClientId string

@description('Key Vault secret name that holds the Atlas service account secret. Not the secret value.')
param atlasClientSecretName string

@description('Container image built from this repository. Grant AcrPull on a private registry to both managed identities.')
param ingestImage string

@description('Public DNS name on the TLS certificate. Atlas connects to https://<name>/v1/logs through Private Link.')
param otlpHostname string

param adminUsername string
@description('SSH public key for the scale set and publisher VM. The private key is not stored by this template.')
param adminSshPublicKey string

param ingestVmSize string = 'Standard_D2s_v5'
param publisherVmSize string = 'Standard_D2s_v5'

@minValue(2)
@maxValue(20)
param ingestInstances int = 2

@minValue(2)
@maxValue(20)
param maxIngestInstances int = 10

param purgeProtection bool = true
param vnetAddressPrefix string = '10.20.0.0/16'
param ingestSubnetPrefix string = '10.20.0.0/24'
param plsSubnetPrefix string = '10.20.1.0/24'
param peSubnetPrefix string = '10.20.2.0/24'

@description('Extra Azure subscriptions allowed to request a Private Link connection. The current subscription is always included.')
param privateLinkVisibleSubscriptionIds array = []

@description('Extra subscriptions whose Private Link connections are auto-approved. MongoDB subscription ids stay off this list until they are known.')
param privateLinkAutoApproveSubscriptionIds array = []

var prefix = toLower(namePrefix)
var linkWorkspace = linkWorkspaceToAmpls || createDedicatedWorkspace
var allTags = union(tags, {
  product: 'mongodb-atlas-sentinel'
  version: '0.9.0'
})
var tlsKvName = take('kvtls${uniqueString(resourceGroup().id)}', 24)
var controlKvName = take('kvctl${uniqueString(resourceGroup().id)}', 24)
var appConfigName = take('ac${uniqueString(resourceGroup().id)}', 50)
var scriptB64 = base64(loadTextContent('files/install.sh'))

var secretsUser = '4633458b-17de-408a-b874-0445c86b69e6'
var certificateUser = 'db79e9a7-68ee-4b58-9aeb-b90e7c24fcba'
var cryptoUser = '12338af0-0e69-4776-bea7-57ae8d297424'
var appConfigReader = '516239f1-63e1-4d78-a4de-a74fb236a071'
var appConfigOwner = '5ae67dd6-50cb-40e7-96ff-dc2bfa4b606b'

func cloudInit(envBase64 string, role string, scriptBase64 string) string => '#cloud-config\npackage_update: true\npackages:\n  - docker.io\n  - python3\nwrite_files:\n  - path: /usr/local/sbin/atlas-sentinel-install.sh\n    permissions: "0755"\n    encoding: b64\n    content: ${scriptBase64}\n  - path: /etc/atlas-sentinel/${role}.env\n    permissions: "0644"\n    encoding: b64\n    content: ${envBase64}\nruncmd:\n  - [ /usr/local/sbin/atlas-sentinel-install.sh, /etc/atlas-sentinel/${role}.env, ${role} ]\n'

var seedIdentityId = resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', '${prefix}-seed-id')

module ingestId 'modules/identity.bicep' = {
  name: 'ingest-identity'
  params: {
    name: '${prefix}-ingest-id'
    location: location
    tags: allTags
  }
}

module publisherId 'modules/identity.bicep' = {
  name: 'publisher-identity'
  params: {
    name: '${prefix}-publisher-id'
    location: location
    tags: allTags
  }
}

module scriptId 'modules/identity.bicep' = {
  name: 'seed-identity'
  params: {
    name: '${prefix}-seed-id'
    location: location
    tags: allTags
  }
}

module network 'modules/network.bicep' = {
  name: 'network'
  params: {
    location: location
    prefix: prefix
    tags: allTags
    addressPrefix: vnetAddressPrefix
    ingestPrefix: ingestSubnetPrefix
    plsPrefix: plsSubnetPrefix
    pePrefix: peSubnetPrefix
    visibleSubscriptionIds: privateLinkVisibleSubscriptionIds
    autoApproveSubscriptionIds: privateLinkAutoApproveSubscriptionIds
  }
}

module monitor 'modules/monitor.bicep' = {
  name: 'monitor'
  params: {
    location: location
    prefix: prefix
    tags: allTags
    workspaceName: workspaceName
    createWorkspace: createDedicatedWorkspace
    linkWorkspace: linkWorkspace
    lockQueryToPrivateLink: lockQueryToPrivateLink
    retentionInDays: retentionInDays
    subnetId: network.outputs.privateEndpointSubnetId
    monitorDnsZoneIds: network.outputs.monitorDnsZoneIds
    ingestPrincipalId: ingestId.outputs.principalId
  }
}

module tlsKv 'modules/keyvault.bicep' = {
  name: 'tls-kv'
  params: {
    name: tlsKvName
    location: location
    tags: allTags
    purgeProtection: purgeProtection
    subnetId: network.outputs.privateEndpointSubnetId
    privateDnsZoneId: network.outputs.vaultDnsZoneId
    assignments: [
      {
        principalId: ingestId.outputs.principalId
        roleDefinitionId: secretsUser
      }
    ]
  }
}

module controlKv 'modules/keyvault.bicep' = {
  name: 'control-kv'
  params: {
    name: controlKvName
    location: location
    tags: allTags
    purgeProtection: purgeProtection
    subnetId: network.outputs.privateEndpointSubnetId
    privateDnsZoneId: network.outputs.vaultDnsZoneId
    assignments: [
      {
        principalId: publisherId.outputs.principalId
        roleDefinitionId: secretsUser
      }
      {
        principalId: publisherId.outputs.principalId
        roleDefinitionId: certificateUser
      }
      {
        principalId: publisherId.outputs.principalId
        roleDefinitionId: cryptoUser
      }
    ]
  }
}

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' = {
  name: appConfigName
  location: location
  tags: allTags
  sku: { name: 'standard' }
  properties: {
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource appConfigPe 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${prefix}-appconfig-pe'
  location: location
  tags: allTags
  properties: {
    subnet: { id: network.outputs.privateEndpointSubnetId }
    privateLinkServiceConnections: [
      {
        name: 'appconfig'
        properties: {
          privateLinkServiceId: appConfig.id
          groupIds: ['configurationStores']
        }
      }
    ]
  }
}

resource appConfigDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: appConfigPe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'appconfig'
        properties: {
          privateDnsZoneId: network.outputs.appConfigDnsZoneId
        }
      }
    ]
  }
}

resource ingestConfig 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appConfig.id, ingestId.name, appConfigReader)
  scope: appConfig
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', appConfigReader)
    principalId: ingestId.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource publisherConfig 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appConfig.id, publisherId.name, appConfigReader)
  scope: appConfig
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', appConfigReader)
    principalId: publisherId.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource seedOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appConfig.id, scriptId.name, appConfigOwner)
  scope: appConfig
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', appConfigOwner)
    principalId: scriptId.outputs.principalId
    principalType: 'ServicePrincipal'
  }
}

resource seed 'Microsoft.Resources/deploymentScripts@2023-08-01' = {
  name: '${prefix}-seed'
  location: location
  kind: 'AzureCLI'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${seedIdentityId}': {}
    }
  }
  properties: {
    azCliVersion: '2.53.0'
    timeout: 'PT30M'
    retentionInterval: 'P1D'
    cleanupPreference: 'OnSuccess'
    forceUpdateTag: uniqueString(projectsConfigJson)
    environmentVariables: [
      {
        name: 'APPCONFIG_ENDPOINT'
        value: appConfig.properties.endpoint
      }
      {
        name: 'PROJECTS_JSON'
        // Project identifiers, not credentials. The seed script rejects private keys.
        #disable-next-line use-secure-value-for-secure-inputs
        secureValue: projectsConfigJson
      }
    ]
    scriptContent: loadTextContent('files/seed-appconfig.sh')
  }
  dependsOn: [seedOwner]
}

var ingestEnv = 'APP_CONFIGURATION_ENDPOINT=${appConfig.properties.endpoint}\nENTRA_AUDIENCE=${entraAudience}\nREQUIRED_ROLE=${requiredRole}\nREQUIRED_SCOPE=${requiredScope}\nKEYVAULT_URL=${tlsKv.outputs.vaultUri}\nTLS_CERT_NAME=${tlsCertificateName}\nDCE_ENDPOINT=${monitor.outputs.dceEndpoint}\nDCR_IMMUTABLE_ID=${monitor.outputs.dcrImmutableId}\nDCR_STREAM=${monitor.outputs.streamName}\nDCR_TABLE=${monitor.outputs.tableName}\nAZURE_CLIENT_ID=${ingestId.outputs.clientId}\nTLS_ADDR=:8443\nHEALTH_ADDR=:8080\nOTLP_HOSTNAME=${otlpHostname}\nHEARTBEAT_INTERVAL=15m\nINGEST_IMAGE=${ingestImage}\n'
var publisherEnv = 'APP_CONFIGURATION_ENDPOINT=${appConfig.properties.endpoint}\nENTRA_TENANT_ID=${entraTenantId}\nENTRA_CLIENT_ID=${entraClientId}\nENTRA_SCOPE=${entraAudience}/.default\nENTRA_AUDIENCE=${entraAudience}\nREQUIRED_ROLE=${requiredRole}\nREQUIRED_SCOPE=${requiredScope}\nKEYVAULT_URL=${controlKv.outputs.vaultUri}\nENTRA_CERT_NAME=${entraCertificateName}\nATLAS_CLIENT_ID=${atlasClientId}\nATLAS_CLIENT_SECRET_NAME=${atlasClientSecretName}\nOTLP_ENDPOINT=https://${otlpHostname}/v1/logs\nAZURE_CLIENT_ID=${publisherId.outputs.clientId}\nREFRESH_INTERVAL=20m\nINGEST_IMAGE=${ingestImage}\n'

module compute 'modules/compute.bicep' = {
  name: 'compute'
  params: {
    location: location
    prefix: prefix
    tags: allTags
    subnetId: network.outputs.ingestSubnetId
    nsgId: network.outputs.nsgId
    backendPoolId: network.outputs.backendPoolId
    ingestIdentityId: ingestId.outputs.id
    publisherIdentityId: publisherId.outputs.id
    ingestCloudInit: cloudInit(base64(ingestEnv), 'ingest', scriptB64)
    publisherCloudInit: cloudInit(base64(publisherEnv), 'publisher', scriptB64)
    adminUsername: adminUsername
    adminSshPublicKey: adminSshPublicKey
    ingestVmSize: ingestVmSize
    publisherVmSize: publisherVmSize
    ingestInstances: ingestInstances
    maxIngestInstances: maxIngestInstances
  }
  dependsOn: [
    seed
    ingestConfig
    publisherConfig
  ]
}

output privateLinkServiceId string = network.outputs.privateLinkServiceId
output privateLinkServiceAlias string = network.outputs.privateLinkServiceAlias
output otlpEndpoint string = 'https://${otlpHostname}/v1/logs'
output dataCollectionEndpoint string = monitor.outputs.dceEndpoint
output dataCollectionRuleImmutableId string = monitor.outputs.dcrImmutableId
output ingestPrincipalId string = ingestId.outputs.principalId
output publisherPrincipalId string = publisherId.outputs.principalId
output tlsKeyVaultName string = tlsKv.outputs.name
output controlKeyVaultName string = controlKv.outputs.name
output appConfigurationEndpoint string = appConfig.properties.endpoint
output amplsName string = monitor.outputs.amplsName
output workspaceId string = monitor.outputs.workspaceId
output virtualMachineScaleSetId string = compute.outputs.vmssId
