param([string]$Model = 'dolphin-phi:latest', [string]$NextModel = 'dolphin3:latest')
$ErrorActionPreference = 'Stop'
if ($Model -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$') { throw 'Use an Ollama model ID without spaces or shell characters.' }
if ($Model -notmatch ':') { $Model += ':latest' }
if ($NextModel) {
    if ($NextModel -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$') { throw 'Use an Ollama model ID without spaces or shell characters.' }
    if ($NextModel -notmatch ':') { $NextModel += ':latest' }
}
$activeChatModel = ''
$projectDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDir = Join-Path $projectDir 'test-results'
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$statusPath = Join-Path $outputDir 'ollama-setup-status.json'
$logPath = Join-Path $outputDir 'ollama-setup.log'
$installerPath = Join-Path $outputDir 'OllamaSetup.exe'
$lockPath = Join-Path $outputDir 'ollama-setup.lock'
$lock = [IO.File]::Open($lockPath, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
function Set-SetupStatus([string]$Phase, [string]$Message, [string]$DownloadingModel = $Model) {
    $state = @{phase=$Phase; message=$Message; model=$DownloadingModel; activeChatModel=$activeChatModel; pid=$PID; updatedAt=[DateTime]::UtcNow.ToString('o')}
    [IO.File]::WriteAllText($statusPath, ($state | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    [IO.File]::AppendAllText($logPath, ('{0} [{1}] {2}{3}' -f $state.updatedAt,$Phase,$Message,[Environment]::NewLine))
}
function Test-OllamaServer {
    try { $null = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3; return $true } catch { return $false }
}
function Install-ChatModel([string]$ChatModel) {
    $installed = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10
    if (-not ($installed.models | Where-Object { $_.name -eq $ChatModel })) {
        for ($pullAttempt=1; $pullAttempt -le 3; $pullAttempt++) {
            Set-SetupStatus 'downloading-model' "Downloading $ChatModel (attempt $pullAttempt/3). Progress is in test-results/ollama-model.err.log." $ChatModel
            $pull = Start-Process -FilePath $ollamaPath -ArgumentList @('pull',$ChatModel) -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $outputDir 'ollama-model.out.log') -RedirectStandardError (Join-Path $outputDir 'ollama-model.err.log')
            if ($pull.ExitCode -eq 0) { break }
            if ($pullAttempt -eq 3) { throw "Model download failed for $ChatModel after 3 attempts. Re-run the setup script to resume." }
            Set-SetupStatus 'retrying-model' "Connection failed for $ChatModel. Retrying in 30 seconds; installed chat models stay available." $ChatModel
            Start-Sleep -Seconds 30
        }
    }
    $installed = Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10
    if (-not ($installed.models | Where-Object { $_.name -eq $ChatModel })) { throw "Downloaded model $ChatModel was not found in Ollama's installed models." }
    Set-SetupStatus 'verifying-model' "Testing $ChatModel before adding it to the app." $ChatModel
    $body = @{model=$ChatModel; messages=@(@{role='user';content='Reply only with OK.'});stream=$false;max_tokens=8} | ConvertTo-Json -Depth 4
    $reply = Invoke-RestMethod 'http://127.0.0.1:11434/v1/chat/completions' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 300
    if (-not $reply.choices[0].message.content) { throw "The model $ChatModel returned no text. App settings were not switched." }
}
function Set-ChatConfiguration([string]$DefaultModel, [string[]]$AvailableModels) {
    $envPath = Join-Path $projectDir 'server\.env'
    $envText = if (Test-Path -LiteralPath $envPath) { [IO.File]::ReadAllText($envPath) } else { '' }
    $settings = [ordered]@{CHAT_PROVIDER='ollama';OLLAMA_BASE_URL='http://127.0.0.1:11434/v1';DEFAULT_CHAT_MODEL=$DefaultModel;CHAT_MODEL_ALLOWLIST=($AvailableModels -join ',')}
    foreach ($name in $settings.Keys) {
        $pattern = '(?m)^\s*' + [regex]::Escape($name) + '=[^\r\n]*'
        $line = $name + '=' + $settings[$name]
        if ([regex]::IsMatch($envText,$pattern)) { $envText = [regex]::Replace($envText,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{param($match) $line}) }
        else { $envText = $envText.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine }
    }
    [IO.File]::WriteAllText($envPath,$envText,(New-Object Text.UTF8Encoding($false)))
    (Get-Item -LiteralPath (Join-Path $projectDir 'server\config.ts')).LastWriteTimeUtc = [DateTime]::UtcNow
}
try {
    $ollamaPath = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
    $existingCommand = Get-Command ollama.exe -ErrorAction SilentlyContinue
    if ($existingCommand) { $ollamaPath = $existingCommand.Source }
    if (-not (Test-Path -LiteralPath $ollamaPath)) {
        Set-SetupStatus 'downloading-installer' 'Downloading the official Ollama Windows installer; interrupted downloads can resume.'
        # Pinned to the SHA256 published in microsoft/winget-pkgs for Ollama 0.40.5.
        $expectedHash = 'EA0B50685D382BC0AF164ABDBF9B41BD89ABB98DE14FC51E4890A7176757A519'
        $alreadyComplete = (Test-Path -LiteralPath $installerPath) -and (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash -eq $expectedHash
        if (-not $alreadyComplete) {
            $download = Start-Process -FilePath 'curl.exe' -ArgumentList @('--fail','--location','--silent','--show-error','--retry','10','--retry-all-errors','--retry-delay','15','--connect-timeout','30','--continue-at','-','--output',('"{0}"' -f $installerPath),'https://github.com/ollama/ollama/releases/download/v0.40.5/OllamaSetup.exe') -WindowStyle Hidden -Wait -PassThru -RedirectStandardOutput (Join-Path $outputDir 'ollama-download.out.log') -RedirectStandardError (Join-Path $outputDir 'ollama-download.err.log')
            if ($download.ExitCode -ne 0) { throw "Installer download failed (exit $($download.ExitCode)). Re-run scripts/setup-ollama.ps1 to resume; see test-results/ollama-download.err.log." }
        }
        if ((Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash -ne $expectedHash) { throw 'Installer checksum did not match the official package. Installation stopped.' }
        Set-SetupStatus 'installing' 'Installer checksum verified. Installing Ollama for the current Windows user.'
        # Wait only for the installer, not the long-lived Ollama tray app it launches.
        $install = Start-Process -FilePath $installerPath -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/SP-') -WindowStyle Hidden -PassThru
        $install.WaitForExit()
        if ($install.ExitCode -notin @(0,3010)) { throw "Ollama installation failed (exit $($install.ExitCode))." }
        if (-not (Test-Path -LiteralPath $ollamaPath)) { throw 'Ollama executable was not found after installation.' }
    }
    Set-SetupStatus 'starting-server' 'Checking the local Ollama server.'
    if (-not (Test-OllamaServer)) {
        $null = Start-Process -FilePath $ollamaPath -ArgumentList 'serve' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $outputDir 'ollama-server.out.log') -RedirectStandardError (Join-Path $outputDir 'ollama-server.err.log')
        $serverReady = $false
        for ($attempt=0; $attempt -lt 30; $attempt++) {
            if (Test-OllamaServer) { $serverReady=$true; break }
            Start-Sleep -Seconds 2
        }
        if (-not $serverReady) { throw 'The local Ollama server did not start. See test-results/ollama-server.err.log.' }
    }
    Install-ChatModel $Model
    Set-ChatConfiguration $Model @($Model)
    $activeChatModel = $Model
    Set-SetupStatus 'first-model-ready' "$Model is verified and configured for chat. The larger model will download next."
    if ($NextModel -and $NextModel -ne $Model) {
        Install-ChatModel $NextModel
        # Keep the first model usable and selected; offer the larger one in the dropdown.
        Set-ChatConfiguration $Model @($Model,$NextModel)
    }
    Set-SetupStatus 'ready' 'Local models verified and configured. Refresh the app; restart npm run dev if needed. Choose an installed model in the dropdown. Keep Ollama running.'
} catch {
    $failureMessage = $_.Exception.Message
    if ($activeChatModel) { $failureMessage += " Chat remains configured for $activeChatModel." }
    Set-SetupStatus 'failed' $failureMessage
    throw
} finally {
    $lock.Dispose()
}
