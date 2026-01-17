using './main.bicep'

// Parameters for the Communication Service deployment (Japan only)
param communicationServiceName = 'jns-communication-service'
param tags = {
  environment: 'development'
  project: 'phone-calling'
  region: 'japan'
  managedBy: 'bicep'
}
