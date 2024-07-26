@description('The name of the function app that you wish to create.')
param appName string = resourceGroup().name

@description('Location for all resources.')
param location string = resourceGroup().location

resource hostingPlan 'Microsoft.Web/serverfarms@2021-03-01' = {
  name: appName
  location: location
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
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
  }
}

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2021-06-01' = {
  name: appName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource databaseAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15-preview' = {
  name: appName
  kind: 'GlobalDocumentDB'
  location: location
  properties: { 
    capacityMode: 'Serverless'
    databaseAccountOfferType: 'Standard'
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
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  name: appName
  parent: databaseAccount
  properties: {
    resource: {
      id: appName
    }
  }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  name: appName
  parent: database
  properties: {
    resource: {
      id: appName
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
      }
    }
  }
}
