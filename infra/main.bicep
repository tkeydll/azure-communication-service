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
