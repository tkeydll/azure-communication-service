[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ResourceGroup,

    [string]$Subscription = '',

    [string]$Location = 'japaneast'
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

$deploymentArgs = @(
    'deployment', 'group', 'create',
    '--name', 'acs-deployment',
    '--resource-group', $ResourceGroup,
    '--template-file', 'infra/main.bicep',
    '--parameters', 'infra/main.bicepparam',
    '--mode', 'Incremental',
    '--output', 'json'
)

if (-not [string]::IsNullOrWhiteSpace($Subscription)) {
    $deploymentArgs += @('--subscription', $Subscription)
}

az @deploymentArgs
if ($LASTEXITCODE -ne 0) {
    throw "Azure deployment failed with exit code $LASTEXITCODE"
}
