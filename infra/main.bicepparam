using './main.bicep'

// Parameters for the Communication Service deployment (Japan only)
param communicationServiceName = 'jns-communication-service'
// Set to true to reuse an existing ACS instead of creating a new one.
param useExistingCommunicationService = true
// Resource group containing the existing Communication Service.
param existingCommunicationServiceResourceGroupName = 'notification'
param tags = {
  environment: 'development'
  project: 'phone-calling'
  region: 'japan'
  managedBy: 'bicep'
}

// Phone calling configuration
param audioDurationMs = '2000'
// Values are supplied by scripts/deploy.ps1 at deployment time.
param fromPhoneNumber = readEnvironmentVariable('ACS_FROM_PHONE_NUMBER', '')
param toPhoneNumber = readEnvironmentVariable('ACS_TO_PHONE_NUMBER', '')
