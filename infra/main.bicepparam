using './main.bicep'

// Parameters for the Communication Service deployment (Japan only)
param communicationServiceName = 'jns-communication-service'
param useExistingCommunicationService = true
param existingCommunicationServiceResourceGroupName = 'notification'
param storageAccountName = 'jnscommservicest'
param logAnalyticsWorkspaceName = 'jns-communication-service-logs'
param applicationInsightsName = 'jns-communication-service-insights'
param appServicePlanName = 'jns-communication-service-plan'
param functionAppName = 'jns-communication-service-function-3'
param tags = {
  environment: 'development'
  project: 'phone-calling'
  region: 'japan'
  managedBy: 'bicep'
}

// Phone calling configuration
param fromPhoneNumber = ''
param toPhoneNumber = ''
param audioFileUrl = ''
param getAudioFunctionKey = ''
