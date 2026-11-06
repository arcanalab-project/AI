param location string
param prefix string
param tags object
param subnetId string
param nsgId string
param backendPoolId string
param ingestIdentityId string
param publisherIdentityId string
param ingestCloudInit string
param publisherCloudInit string
param adminUsername string
param adminSshPublicKey string
param ingestVmSize string
param publisherVmSize string
param ingestInstances int
param maxIngestInstances int

var scaleCeiling = max(maxIngestInstances, ingestInstances)
var image = {
  publisher: 'Canonical'
  offer: '0001-com-ubuntu-server-jammy'
  sku: '22_04-lts-gen2'
  version: 'latest'
}

resource vmss 'Microsoft.Compute/virtualMachineScaleSets@2024-03-01' = {
  name: '${prefix}-ingest'
  location: location
  tags: tags
  sku: {
    name: ingestVmSize
    tier: 'Standard'
    capacity: ingestInstances
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${ingestIdentityId}': {}
    }
  }
  properties: {
    overprovision: false
    singlePlacementGroup: false
    upgradePolicy: { mode: 'Manual' }
    automaticRepairsPolicy: {
      enabled: true
      gracePeriod: 'PT30M'
    }
    virtualMachineProfile: {
      storageProfile: {
        imageReference: image
        osDisk: {
          createOption: 'FromImage'
          caching: 'ReadWrite'
          managedDisk: { storageAccountType: 'Premium_LRS' }
        }
      }
      osProfile: {
        computerNamePrefix: 'atlsent'
        adminUsername: adminUsername
        customData: base64(ingestCloudInit)
        linuxConfiguration: {
          disablePasswordAuthentication: true
          ssh: {
            publicKeys: [
              {
                path: '/home/${adminUsername}/.ssh/authorized_keys'
                keyData: adminSshPublicKey
              }
            ]
          }
        }
      }
      networkProfile: {
        networkInterfaceConfigurations: [
          {
            name: 'nic'
            properties: {
              primary: true
              networkSecurityGroup: { id: nsgId }
              ipConfigurations: [
                {
                  name: 'ip'
                  properties: {
                    primary: true
                    subnet: { id: subnetId }
                    loadBalancerBackendAddressPools: [
                      { id: backendPoolId }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
      securityProfile: {
        securityType: 'TrustedLaunch'
        uefiSettings: {
          secureBootEnabled: true
          vTpmEnabled: true
        }
      }
      diagnosticsProfile: {
        bootDiagnostics: { enabled: true }
      }
      extensionProfile: {
        extensions: [
          {
            name: 'Health'
            properties: {
              autoUpgradeMinorVersion: true
              publisher: 'Microsoft.ManagedServices'
              type: 'ApplicationHealthLinux'
              typeHandlerVersion: '1.0'
              settings: {
                protocol: 'http'
                port: 8080
                requestPath: '/healthz'
              }
            }
          }
        ]
      }
    }
  }
}

resource autoscale 'Microsoft.Insights/autoscalesettings@2022-10-01' = {
  name: '${prefix}-ingest-scale'
  location: location
  tags: tags
  properties: {
    enabled: true
    targetResourceUri: vmss.id
    profiles: [
      {
        name: 'default'
        capacity: {
          minimum: string(ingestInstances)
          maximum: string(scaleCeiling)
          default: string(ingestInstances)
        }
        rules: [
          {
            metricTrigger: {
              metricName: 'Percentage CPU'
              metricResourceUri: vmss.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 70
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
          {
            metricTrigger: {
              metricName: 'Percentage CPU'
              metricResourceUri: vmss.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'LessThan'
              threshold: 30
            }
            scaleAction: {
              direction: 'Decrease'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
        ]
      }
    ]
  }
}

resource publisherNic 'Microsoft.Network/networkInterfaces@2023-11-01' = {
  name: '${prefix}-publisher-nic'
  location: location
  tags: tags
  properties: {
    networkSecurityGroup: { id: nsgId }
    ipConfigurations: [
      {
        name: 'ip'
        properties: {
          primary: true
          privateIPAllocationMethod: 'Dynamic'
          subnet: { id: subnetId }
        }
      }
    ]
  }
}

resource publisher 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: '${prefix}-publisher'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${publisherIdentityId}': {}
    }
  }
  properties: {
    hardwareProfile: { vmSize: publisherVmSize }
    storageProfile: {
      imageReference: image
      osDisk: {
        createOption: 'FromImage'
        caching: 'ReadWrite'
        managedDisk: { storageAccountType: 'Premium_LRS' }
      }
    }
    osProfile: {
      computerName: 'atlpub'
      adminUsername: adminUsername
      customData: base64(publisherCloudInit)
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: adminSshPublicKey
            }
          ]
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        { id: publisherNic.id }
      ]
    }
    securityProfile: {
      securityType: 'TrustedLaunch'
      uefiSettings: {
        secureBootEnabled: true
        vTpmEnabled: true
      }
    }
    diagnosticsProfile: {
      bootDiagnostics: { enabled: true }
    }
  }
}

output vmssId string = vmss.id
output publisherId string = publisher.id
