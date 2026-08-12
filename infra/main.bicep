// Azure Communication Service Infrastructure Template
// This template deploys Azure Communication Service with phone number capabilities

@description('The name of the Azure Communication Service instance')
param communicationServiceName string = 'acs-${uniqueString(resourceGroup().id)}'

@description('Whether to use an existing Azure Communication Service with the specified name instead of creating one')
param useExistingCommunicationService bool = false

@description('The resource group containing the existing Azure Communication Service')
param existingCommunicationServiceResourceGroupName string = 'notification'

@description('The name of the storage account used by Azure Functions')
param storageAccountName string = take(toLower(replace('${communicationServiceName}st', '-', '')), 24)

@description('The name of the Log Analytics workspace')
param logAnalyticsWorkspaceName string = '${communicationServiceName}-logs'

@description('The name of the Application Insights component')
param applicationInsightsName string = '${communicationServiceName}-insights'

@description('The name of the App Service plan')
param appServicePlanName string = '${communicationServiceName}-plan'

@description('The name of the Function App')
param functionAppName string = '${communicationServiceName}-function'

@description('Tags to apply to all resources')
param tags object = {
  environment: 'development'
  project: 'phone-calling'
  region: 'japan'
}

@description('Audio playback duration in milliseconds')
param audioDurationMs string = '2000'

@description('The phone number used as the caller ID for outbound calls')
param fromPhoneNumber string = ''

@description('The default destination phone number for outbound calls')
param toPhoneNumber string = ''

@description('The default audio file URL used for call playback')
param audioFileUrl string = ''

@description('The function key used to call the GetAudio endpoint')
@secure()
param getAudioFunctionKey string = ''

// Azure Communication Service (Japan only)
resource communicationService 'Microsoft.Communication/communicationServices@2025-05-01-preview' = if (!useExistingCommunicationService) {
  name: communicationServiceName
  location: 'global'
  tags: tags
  properties: {
    dataLocation: 'Japan'
  }
}

resource existingCommunicationService 'Microsoft.Communication/communicationServices@2025-05-01-preview' existing = {
  scope: resourceGroup(existingCommunicationServiceResourceGroupName)
  name: communicationServiceName
}

// Storage Account for Azure Functions
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
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
  name: logAnalyticsWorkspaceName
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
  name: applicationInsightsName
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
  name: appServicePlanName
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
  dependsOn: [
    communicationService
  ]
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
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'COMMUNICATION_SERVICES_CONNECTION_STRING'
          value: existingCommunicationService.listKeys().primaryConnectionString
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: applicationInsights.properties.InstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsights.properties.ConnectionString
        }
        {
          name: 'AUDIO_DURATION_MS'
          value: audioDurationMs
        }
        {
          name: 'FROM_PHONE_NUMBER'
          value: fromPhoneNumber
        }
        {
          name: 'TO_PHONE_NUMBER'
          value: toPhoneNumber
        }
        {
          name: 'AUDIO_FILE_URL'
          value: audioFileUrl
        }
        {
          name: 'GETAUDIO_FUNCTION_KEY'
          value: getAudioFunctionKey
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
output connectionString string = useExistingCommunicationService
  ? existingCommunicationService.listKeys().primaryConnectionString
  : communicationService.listKeys().primaryConnectionString

@description('The resource ID of the Communication Service')
output communicationServiceId string = useExistingCommunicationService
  ? existingCommunicationService.id
  : communicationService.id

@description('The name of the Communication Service')
output communicationServiceName string = useExistingCommunicationService
  ? existingCommunicationService.name
  : communicationService.name

@description('The endpoint of the Communication Service')
output endpoint string = useExistingCommunicationService
  ? existingCommunicationService.properties.hostName
  : communicationService.properties.hostName
