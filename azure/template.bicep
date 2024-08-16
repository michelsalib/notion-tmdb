@description('The name of the function app that you wish to create.')
param appName string = resourceGroup().name

@description('Location for all resources.')
param location string = resourceGroup().location

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
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: insights.properties.InstrumentationKey
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

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: database
  name: appName
  properties: {
    resource: {
      id: appName
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

resource certificate 'Microsoft.Web/certificates@2023-12-01' = {
  name: appName
  location: location
  properties: {
    canonicalName: 'notion-tmdb.micheldev.com'
    serverFarmId: hostingPlan.id
  }
}

resource appCustomDomain 'Microsoft.Web/sites/hostNameBindings@2023-12-01' = {
  parent: functionApp
  name: 'notion-tmdb.micheldev.com'
  properties: {
    sslState: 'SniEnabled'
    thumbprint: certificate.properties.thumbprint
  }
}
