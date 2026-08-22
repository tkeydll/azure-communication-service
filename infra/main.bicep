// Azure Communication Service Infrastructure Template
// This template deploys Azure Communication Service with phone number capabilities

@description('The name of the Azure Communication Service instance')
@minLength(3)
param communicationServiceName string = 'acs-${uniqueString(resourceGroup().id)}'

@description('Whether to use an existing Azure Communication Service instead of creating one')
param useExistingCommunicationService bool = false

@description('The name of the existing Azure Communication Service. Defaults to communicationServiceName when not specified.')
@minLength(3)
param existingCommunicationServiceName string = communicationServiceName

@description('Tags to apply to all resources')
param tags object = {
  environment: 'development'
  project: 'phone-calling'
  region: 'japan'
}

@description('Audio playback duration in milliseconds')
param audioDurationMs string = '2000'

@description('The E.164 phone number used as the caller ID')
param fromPhoneNumber string = ''

@description('The default E.164 destination phone number')
param toPhoneNumber string = ''

// Azure Communication Service (Japan only)
resource newCommunicationService 'Microsoft.Communication/communicationServices@2025-05-01-preview' = if (!useExistingCommunicationService) {
  name: communicationServiceName
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Japan'
  }
}

var selectedCommunicationServiceName = useExistingCommunicationService
  ? existingCommunicationServiceName
  : communicationServiceName
var selectedCommunicationServiceResourceId = resourceId(
  'Microsoft.Communication/communicationServices',
  selectedCommunicationServiceName
)
var communicationServiceConnectionString = listKeys(
  selectedCommunicationServiceResourceId,
  '2025-05-01-preview'
).primaryConnectionString
var communicationServiceEndpoint = reference(
  selectedCommunicationServiceResourceId,
  '2025-05-01-preview'
).hostName
var functionAppName = '${communicationServiceName}-function'
var functionAppHostName = '${functionAppName}.azurewebsites.net'

// Storage Account for Azure Functions
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('st${uniqueString(resourceGroup().id)}', 24)
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
  name: functionAppName
  location: resourceGroup().location
  tags: tags
  kind: 'functionapp,linux'
  dependsOn: useExistingCommunicationService ? [] : [
    newCommunicationService
  ]
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|22'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

resource functionAppSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  name: 'appsettings'
  parent: functionApp
  properties: {
    AzureWebJobsStorage: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
    FUNCTIONS_EXTENSION_VERSION: '~4'
    FUNCTIONS_WORKER_RUNTIME: 'node'
    COMMUNICATION_SERVICES_CONNECTION_STRING: communicationServiceConnectionString
    APPINSIGHTS_INSTRUMENTATIONKEY: applicationInsights.properties.InstrumentationKey
    APPLICATIONINSIGHTS_CONNECTION_STRING: applicationInsights.properties.ConnectionString
    AUDIO_DURATION_MS: audioDurationMs
    FROM_PHONE_NUMBER: fromPhoneNumber
    TO_PHONE_NUMBER: toPhoneNumber
    CALLBACK_URL: 'https://${functionAppHostName}/api/CallEvents?code=${listKeys(format('{0}/host/default', functionApp.id), '2022-03-01').functionKeys.default}'
    AUDIO_FILE_URL: 'https://${functionAppHostName}/api/GetAudio?code=${listKeys(format('{0}/host/default', functionApp.id), '2022-03-01').functionKeys.default}'
    CALLBACK_FUNCTION_KEY: listKeys(format('{0}/host/default', functionApp.id), '2022-03-01').functionKeys.default
    GETAUDIO_FUNCTION_KEY: listKeys(format('{0}/host/default', functionApp.id), '2022-03-01').functionKeys.default
  }
}

// Output the connection string and resource details
@description('The connection string for the Communication Service')
@secure()
output connectionString string = communicationServiceConnectionString

@description('The resource ID of the Communication Service')
output communicationServiceId string = selectedCommunicationServiceResourceId

@description('The name of the Communication Service')
output communicationServiceName string = selectedCommunicationServiceName

@description('The endpoint of the Communication Service')
output endpoint string = communicationServiceEndpoint
