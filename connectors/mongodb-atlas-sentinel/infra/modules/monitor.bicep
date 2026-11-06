param location string
param prefix string
param tags object
param workspaceName string
param createWorkspace bool
param linkWorkspace bool
param lockQueryToPrivateLink bool
param retentionInDays int
param subnetId string
param monitorDnsZoneIds array
param ingestPrincipalId string

var dceName = take('${prefix}-dce', 44)
var dcrName = take('${prefix}-dcr', 64)
var amplsName = take('${prefix}-ampls', 60)
var tableName = 'MongoDBAtlasLogs_CL'
var streamName = 'Custom-${tableName}'

var columns = [
  { name: 'TimeGenerated', type: 'datetime' }
  { name: 'EventTime', type: 'datetime' }
  { name: 'TimeAdjusted', type: 'boolean' }
  { name: 'IngestVersion', type: 'string' }
  { name: 'IngestReplica', type: 'string' }
  { name: 'AtlasOrgId', type: 'string' }
  { name: 'AtlasGroupId', type: 'string' }
  { name: 'AtlasProjectName', type: 'string' }
  { name: 'AtlasClusterName', type: 'string' }
  { name: 'AtlasHostName', type: 'string' }
  { name: 'LogType', type: 'string' }
  { name: 'Severity', type: 'string' }
  { name: 'SeverityNumber', type: 'int' }
  { name: 'Component', type: 'string' }
  { name: 'MongoLogId', type: 'string' }
  { name: 'Message', type: 'string' }
  { name: 'AType', type: 'string' }
  { name: 'Result', type: 'string' }
  { name: 'UserName', type: 'string' }
  { name: 'RemoteIp', type: 'string' }
  { name: 'LocalIp', type: 'string' }
  { name: 'RawLog', type: 'string' }
  { name: 'RawLogTruncated', type: 'boolean' }
  { name: 'Attributes', type: 'dynamic' }
  { name: 'RecordHash', type: 'string' }
  { name: 'OtelTraceId', type: 'string' }
  { name: 'OtelSpanId', type: 'string' }
  { name: 'EntraTenantId', type: 'string' }
  { name: 'EntraClientId', type: 'string' }
]

resource existingWs 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = if (!createWorkspace) {
  name: workspaceName
}

resource newWs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = if (createWorkspace) {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: retentionInDays
    publicNetworkAccessForIngestion: 'Disabled'
    publicNetworkAccessForQuery: lockQueryToPrivateLink ? 'Disabled' : 'Enabled'
    features: { enableLogAccessUsingOnlyResourcePermissions: true }
  }
}

resource sentinel 'Microsoft.SecurityInsights/onboardingStates@2024-03-01' = if (createWorkspace) {
  scope: newWs
  name: 'default'
  properties: {}
}

var tableProperties = {
  retentionInDays: retentionInDays
  schema: {
    name: tableName
    columns: columns
  }
}

resource tableOnNew 'Microsoft.OperationalInsights/workspaces/tables@2022-10-01' = if (createWorkspace) {
  parent: newWs
  name: tableName
  properties: tableProperties
  dependsOn: [sentinel]
}

resource tableOnExisting 'Microsoft.OperationalInsights/workspaces/tables@2022-10-01' = if (!createWorkspace) {
  parent: existingWs
  name: tableName
  properties: tableProperties
}

resource dce 'Microsoft.Insights/dataCollectionEndpoints@2022-06-01' = {
  name: dceName
  location: location
  tags: tags
  properties: {
    networkAcls: {
      publicNetworkAccess: 'Disabled'
    }
  }
}

resource dcr 'Microsoft.Insights/dataCollectionRules@2022-06-01' = {
  name: dcrName
  location: location
  tags: tags
  properties: {
    dataCollectionEndpointId: dce.id
    streamDeclarations: {
      'Custom-MongoDBAtlasLogs_CL': {
        columns: columns
      }
    }
    destinations: {
      logAnalytics: [
        {
          workspaceResourceId: createWorkspace ? newWs.id : existingWs.id
          name: 'la'
        }
      ]
    }
    dataFlows: [
      {
        streams: [streamName]
        destinations: ['la']
        transformKql: 'source'
        outputStream: streamName
      }
    ]
  }
  dependsOn: [
    tableOnNew
    tableOnExisting
  ]
}

resource ampls 'Microsoft.Insights/privateLinkScopes@2021-07-01-preview' = {
  name: amplsName
  location: 'global'
  tags: tags
  properties: {
    accessModeSettings: {
      ingestionAccessMode: 'PrivateOnly'
      queryAccessMode: lockQueryToPrivateLink ? 'PrivateOnly' : 'Open'
    }
  }
}

resource dceScope 'Microsoft.Insights/privateLinkScopes/scopedResources@2021-07-01-preview' = {
  parent: ampls
  name: 'dce'
  properties: {
    linkedResourceId: dce.id
  }
}

resource workspaceScope 'Microsoft.Insights/privateLinkScopes/scopedResources@2021-07-01-preview' = if (linkWorkspace) {
  parent: ampls
  name: 'workspace'
  properties: {
    linkedResourceId: createWorkspace ? newWs.id : existingWs.id
  }
}

resource amplsPe 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: '${prefix}-ampls-pe'
  location: location
  tags: tags
  properties: {
    subnet: { id: subnetId }
    privateLinkServiceConnections: [
      {
        name: 'azuremonitor'
        properties: {
          privateLinkServiceId: ampls.id
          groupIds: ['azuremonitor']
        }
      }
    ]
  }
}

resource amplsDns 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: amplsPe
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [for (zoneId, i) in monitorDnsZoneIds: {
      name: 'monitor-${i}'
      properties: {
        privateDnsZoneId: zoneId
      }
    }]
  }
}

resource dcrPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(dcr.id, ingestPrincipalId, '3913510d-42f4-4e42-8a64-420c390055eb')
  scope: dcr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb')
    principalId: ingestPrincipalId
    principalType: 'ServicePrincipal'
  }
}

output dcrId string = dcr.id
output dcrImmutableId string = empty(dcrPublisher.id) ? dcr.properties.immutableId : dcr.properties.immutableId
output dceEndpoint string = dce.properties.logsIngestion.endpoint
output workspaceId string = createWorkspace ? newWs.id : existingWs.id
output amplsName string = ampls.name
output streamName string = streamName
output tableName string = tableName
