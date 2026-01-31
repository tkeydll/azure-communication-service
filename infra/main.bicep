// Azure Communication Service Infrastructure Template
// This template deploys Azure Communication Service with phone number capabilities

@description('The name of the Azure Communication Service instance')
param communicationServiceName string = 'acs-${uniqueString(resourceGroup().id)}'

@description('Tags to apply to all resources')
param tags object = {
  environment: 'development'
  project: 'phone-calling'
  region: 'japan'
}

// Azure Communication Service (Japan only)
resource communicationService 'Microsoft.Communication/communicationServices@2025-05-01-preview' = {
  name: communicationServiceName
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Japan'
  }
}

// Storage Account for Azure Functions
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take(toLower(replace('${communicationServiceName}st', '-', '')), 24)
  location: resourceGroup().location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
  }
}

// Log Analytics Workspace
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${communicationServiceName}-logs'
  location: resourceGroup().location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30 // 最低値（Free tierでは30日が最小）
    workspaceCapping: {
      dailyQuotaGb: json('0.023') // 最低値（約23MB/日）
    }
  }
}

// Application Insights
resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${communicationServiceName}-insights'
  location: resourceGroup().location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// App Service Plan (Consumption Plan)
resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${communicationServiceName}-plan'
  location: resourceGroup().location
  tags: tags
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true // Linux
  }
}

// Function App
resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: '${communicationServiceName}-function'
  location: resourceGroup().location
  tags: tags
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower('${communicationServiceName}-func')
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'COMMUNICATION_SERVICE_CONNECTION_STRING'
          value: communicationService.listKeys().primaryConnectionString
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: applicationInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsights.properties.ConnectionString
        }
      ]
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// Output the connection string and resource details
@description('The connection string for the Communication Service')
@secure()
output connectionString string = communicationService.listKeys().primaryConnectionString

@description('The resource ID of the Communication Service')
output communicationServiceId string = communicationService.id

@description('The name of the Communication Service')
output communicationServiceName string = communicationService.name

@description('The endpoint of the Communication Service')
output endpoint string = communicationService.properties.hostName
