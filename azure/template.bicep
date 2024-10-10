@description('The name of the function app that you wish to create.')
param appName string = resourceGroup().name

@description('Location for all resources.')
param location string = resourceGroup().location

var distros = ['notion-tmdb', 'notion-gbook', 'notion-backup']

resource hostingPlan 'Microsoft.Web/serverfarms@2021-03-01' = {
  name: appName
  location: location
  sku: {
    name: 'Y1'
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: hostingPlan.id
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    siteConfig: {
      minTlsVersion: '1.2'
      publicNetworkAccess: 'Enabled'
      localMySqlEnabled: false
      netFrameworkVersion: 'v4.6'
      cors: {
        allowedOrigins: [
          'https://portal.azure.com'
        ]
      }
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_NODE_DEFAULT_VERSION'
          value: '~20'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR'
          value: 'true'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: insights.properties.InstrumentationKey
        }
        {
          name: 'Storage:Key'
          value: storageAccount.listKeys().keys[0].value
        }
        {
          name: 'Storage:Account'
          value: storageAccount.name
        }
        {
          name: 'Storage:Container'
          value: '${storageAccount.properties.primaryEndpoints.blob}${storageContainer.name}'
        }
        {
          name: 'AzureWebJobsSecretStorageType'
          value: 'files'
        }
        {
          name: 'CosmosDb:Account'
          value: databaseAccount.properties.documentEndpoint
        }
        {
          name: 'CosmosDb:Key'
          value: databaseAccount.listKeys().primaryMasterKey
        }
        {
          name: 'CosmosDb:Database'
          value: database.name
        }
      ]
    }
  }
}

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: appName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    Flow_Type: 'Bluefield'
    Request_Source: 'rest'
  }
}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2021-06-01' = {
  name: appName
  location: location
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource databaseAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: appName
  kind: 'GlobalDocumentDB'
  location: location
  properties: {
    databaseAccountOfferType: 'Standard'
    defaultIdentity: 'FirstPartyIdentity'
    minimalTlsVersion: 'Tls12'
    capabilities: [
      { name: 'EnableServerless' }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    backupPolicy: {
      type: 'Periodic'
      periodicModeProperties: {
        backupIntervalInMinutes: 240
        backupRetentionIntervalInHours: 8
        backupStorageRedundancy: 'Geo'
      }
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    analyticalStorageConfiguration: {
      schemaType: 'WellDefined'
    }
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: databaseAccount
  name: appName
  properties: {
    resource: {
      id: appName
    }
  }
}

resource containers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = [
  for distro in distros: {
    parent: database
    name: distro
    properties: {
      resource: {
        id: distro
        indexingPolicy: {
          automatic: true
          includedPaths: [
            { path: '/*' }
          ]
        }
        partitionKey: {
          paths: [
            '/id'
          ]
          kind: 'Hash'
        }
      }
    }
  }
]

resource certificates 'Microsoft.Web/certificates@2023-12-01' = [ for distro in distros: {
  name: '${distro}-certificate'
  location: location
  properties: {
    canonicalName: '${distro}.micheldev.com'
    serverFarmId: hostingPlan.id
  }
}]

@batchSize(1)
resource appCustomDomains 'Microsoft.Web/sites/hostNameBindings@2023-12-01' = [ for (distro, i) in distros: {
  parent: functionApp
  name: '${distro}.micheldev.com'
  properties: {
    sslState: 'SniEnabled'
    thumbprint: certificates[i].properties.thumbprint
  }
}]

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: replace(appName, '-', '')
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
}

resource storageBlobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: 'default'
  parent: storageAccount
  properties: {
    restorePolicy: {
      enabled: true
      days: 30
    }
    isVersioningEnabled: true
    changeFeed: {
      enabled: true
    }
    deleteRetentionPolicy: {
      enabled: true
      days: 60
    }
  }
}

resource storageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: 'notion-backup'
  parent: storageBlobService
}
