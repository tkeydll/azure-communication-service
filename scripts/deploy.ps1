[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [string]$Subscription = ''
)

$ErrorActionPreference = 'Stop'

function Read-E164PhoneNumber {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prompt
    )

    do {
        $value = (Read-Host $Prompt).Trim()
        if ($value -notmatch '^\+[1-9]\d{6,14}$') {
            Write-Warning 'E.164形式で入力してね（例: +819012345678）'
            $value = ''
        }
    } while ([string]::IsNullOrWhiteSpace($value))

    return $value
}

$fromPhoneNumber = Read-E164PhoneNumber '発信元電話番号 (FROM_PHONE_NUMBER)'
$toPhoneNumber = Read-E164PhoneNumber '既定の発信先電話番号 (TO_PHONE_NUMBER)'

$env:ACS_FROM_PHONE_NUMBER = $fromPhoneNumber
$env:ACS_TO_PHONE_NUMBER = $toPhoneNumber

$repoRoot = Split-Path -Parent $PSScriptRoot
$templateFile = Join-Path $repoRoot 'infra\main.bicep'
$parameterFile = Join-Path $repoRoot 'infra\main.bicepparam'

$deploymentArgs = @(
    'deployment', 'group', 'create',
    '--name', 'acs-deployment',
    '--resource-group', $ResourceGroup,
    '--template-file', $templateFile,
    '--parameters', $parameterFile,
    '--mode', 'Incremental',
    '--output', 'json'
)

if (-not [string]::IsNullOrWhiteSpace($Subscription)) {
    $deploymentArgs += @('--subscription', $Subscription)
}

$deploymentOutput = az @deploymentArgs
if ($LASTEXITCODE -ne 0) {
    throw "Azure deployment failed with exit code $LASTEXITCODE"
}

$deployment = $deploymentOutput | ConvertFrom-Json
$functionAppName = $deployment.properties.outputs.functionAppName.value

$functionKeyArgs = @(
    'functionapp', 'keys', 'list',
    '--name', $functionAppName,
    '--resource-group', $ResourceGroup,
    '--query', 'functionKeys.default',
    '--output', 'tsv'
)

if (-not [string]::IsNullOrWhiteSpace($Subscription)) {
    $functionKeyArgs += @('--subscription', $Subscription)
}

$functionKey = az @functionKeyArgs
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($functionKey)) {
    throw "Could not retrieve the default Function App host key for '$functionAppName'"
}

$appSettingsArgs = @(
    'functionapp', 'config', 'appsettings', 'set',
    '--name', $functionAppName,
    '--resource-group', $ResourceGroup,
    '--settings',
    "CALLBACK_FUNCTION_KEY=$functionKey",
    "GETAUDIO_FUNCTION_KEY=$functionKey",
    "CALLBACK_URL=https://$functionAppName.azurewebsites.net/api/CallEvents?code=$([uri]::EscapeDataString($functionKey))",
    "AUDIO_FILE_URL=https://$functionAppName.azurewebsites.net/api/GetAudio?code=$([uri]::EscapeDataString($functionKey))"
)

if (-not [string]::IsNullOrWhiteSpace($Subscription)) {
    $appSettingsArgs += @('--subscription', $Subscription)
}

az @appSettingsArgs | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Failed to configure Function App settings for '$functionAppName'"
}

Write-Host "Deployment completed successfully. Function App: $functionAppName"
