param location string
param prefix string
param tags object
param addressPrefix string
param ingestPrefix string
param plsPrefix string
param pePrefix string
param visibleSubscriptionIds array
param autoApproveSubscriptionIds array

var zoneNames = [
  'privatelink.vaultcore.azure.net'
  'privatelink.azconfig.io'
  'privatelink.monitor.azure.com'
  'privatelink.oms.opinsights.azure.com'
  'privatelink.ods.opinsights.azure.com'
  'privatelink.agentsvc.azure-automation.net'
  'privatelink.blob.${environment().suffixes.storage}'
]
var lbName = '${prefix}-ilb'
var lbFrontendId = resourceId('Microsoft.Network/loadBalancers/frontendIPConfigurations', lbName, 'fe')
var lbBackendId = resourceId('Microsoft.Network/loadBalancers/backendAddressPools', lbName, 'ingest')
var lbProbeId = resourceId('Microsoft.Network/loadBalancers/probes', lbName, 'health')
var visibleSubscriptions = union(visibleSubscriptionIds, [subscription().subscriptionId])
var autoApproveSubscriptions = union(autoApproveSubscriptionIds, [subscription().subscriptionId])

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: '${prefix}-vnet'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [addressPrefix]
    }
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: '${prefix}-nsg'
  location: location
  tags: tags
  properties: {
    securityRules: [
      {
        name: 'AllowAzureLoadBalancer'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: 'AzureLoadBalancer'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
      {
        name: 'AllowVNetIngest'
        properties: {
          priority: 110
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'VirtualNetwork'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRanges: [
            '8080'
            '8443'
          ]
        }
      }
      {
        name: 'DenyOtherInbound'
        properties: {
          priority: 4000
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}

resource natPip 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: '${prefix}-nat-pip'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    publicIPAllocationMethod: 'Static'
    publicIPAddressVersion: 'IPv4'
  }
}

resource nat 'Microsoft.Network/natGateways@2023-11-01' = {
  name: '${prefix}-nat'
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    publicIpAddresses: [
      { id: natPip.id }
    ]
  }
}

resource ingestSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: 'ingest'
  properties: {
    addressPrefix: ingestPrefix
    networkSecurityGroup: { id: nsg.id }
    natGateway: { id: nat.id }
  }
}

resource plsSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: 'private-link'
  properties: {
    addressPrefix: plsPrefix
    privateLinkServiceNetworkPolicies: 'Disabled'
  }
}

resource peSubnet 'Microsoft.Network/virtualNetworks/subnets@2023-11-01' = {
  parent: vnet
  name: 'private-endpoints'
  properties: {
    addressPrefix: pePrefix
    privateEndpointNetworkPolicies: 'Disabled'
  }
}

resource lb 'Microsoft.Network/loadBalancers@2023-11-01' = {
  name: lbName
  location: location
  tags: tags
  sku: { name: 'Standard' }
  properties: {
    frontendIPConfigurations: [
      {
        name: 'fe'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: { id: ingestSubnet.id }
        }
      }
    ]
    backendAddressPools: [
      { name: 'ingest' }
    ]
    probes: [
      {
        name: 'health'
        properties: {
          protocol: 'Http'
          port: 8080
          requestPath: '/healthz'
          intervalInSeconds: 10
          numberOfProbes: 2
        }
      }
    ]
    loadBalancingRules: [
      {
        name: 'otlp'
        properties: {
          frontendIPConfiguration: { id: lbFrontendId }
          backendAddressPool: { id: lbBackendId }
          probe: { id: lbProbeId }
          frontendPort: 443
          backendPort: 8443
          protocol: 'Tcp'
          idleTimeoutInMinutes: 15
          disableOutboundSnat: true
          enableFloatingIP: false
        }
      }
    ]
  }
}

resource pls 'Microsoft.Network/privateLinkServices@2023-11-01' = {
  name: '${prefix}-pls'
  location: location
  tags: tags
  properties: {
    enableProxyProtocol: false
    loadBalancerFrontendIpConfigurations: [
      { id: lbFrontendId }
    ]
    ipConfigurations: [
      {
        name: 'nat'
        properties: {
          primary: true
          privateIPAllocationMethod: 'Dynamic'
          subnet: { id: plsSubnet.id }
        }
      }
    ]
    visibility: { subscriptions: visibleSubscriptions }
    autoApproval: { subscriptions: autoApproveSubscriptions }
  }
}

resource dnsZones 'Microsoft.Network/privateDnsZones@2020-06-01' = [for name in zoneNames: {
  name: name
  location: 'global'
  tags: tags
}]

resource dnsLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = [for (name, i) in zoneNames: {
  parent: dnsZones[i]
  name: '${prefix}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: { id: vnet.id }
  }
}]

output vnetId string = vnet.id
output ingestSubnetId string = ingestSubnet.id
output privateEndpointSubnetId string = peSubnet.id
output nsgId string = nsg.id
output backendPoolId string = lbBackendId
output privateLinkServiceId string = pls.id
output privateLinkServiceAlias string = pls.properties.alias
output vaultDnsZoneId string = dnsZones[0].id
output appConfigDnsZoneId string = dnsZones[1].id
output monitorDnsZoneIds array = [
  dnsZones[2].id
  dnsZones[3].id
  dnsZones[4].id
  dnsZones[5].id
  dnsZones[6].id
]
output natPublicIpId string = natPip.id
