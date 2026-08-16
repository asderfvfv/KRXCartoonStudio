# Install local Piper neural TTS (free, offline) into Tools\piper
# Usage: powershell -ExecutionPolicy Bypass -File scripts\setup-piper.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Dest = Join-Path $Root "Tools\piper"
$Models = Join-Path $Dest "models"
New-Item -ItemType Directory -Force -Path $Models | Out-Null

$PiperZip = Join-Path $env:TEMP "piper_windows_amd64.zip"
$PiperUrl = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"

if (-not (Test-Path (Join-Path $Dest "piper.exe"))) {
  Write-Host "Downloading Piper runtime..."
  curl.exe -L -o $PiperZip $PiperUrl
  Expand-Archive -Path $PiperZip -DestinationPath $Dest -Force
  $nested = Get-ChildItem $Dest -Recurse -Filter "piper.exe" | Select-Object -First 1
  if ($nested -and $nested.DirectoryName -ne $Dest) {
    Copy-Item (Join-Path $nested.DirectoryName "*") $Dest -Recurse -Force
  }
} else {
  Write-Host "Piper runtime already present."
}

# Free RU voices (HuggingFace rhasspy/piper-voices)
$voices = @("irina", "dmitri", "ruslan")
foreach ($name in $voices) {
  $id = "ru_RU-$name-medium"
  foreach ($ext in @(".onnx", ".onnx.json")) {
    $file = "$id$ext"
    $out = Join-Path $Models $file
    if ((Test-Path $out) -and ((Get-Item $out).Length -gt 10000)) {
      Write-Host "Skip existing $file"
      continue
    }
    $url = "https://huggingface.co/rhasspy/piper-voices/resolve/main/ru/ru_RU/$name/medium/$file"
    Write-Host "Downloading $file ..."
    curl.exe -L -o $out $url
    $len = if (Test-Path $out) { (Get-Item $out).Length } else { 0 }
    if ($len -lt 1000) {
      Write-Warning "Failed $file (size=$len)"
      Remove-Item $out -Force -ErrorAction SilentlyContinue
    } else {
      Write-Host "  OK ($([math]::Round($len / 1MB, 1)) MB)"
    }
  }
}

Write-Host ""
Write-Host "Done. Piper at: $Dest"
Get-ChildItem $Models -Filter "*.onnx" | ForEach-Object { Write-Host "  model: $($_.Name)" }
Write-Host "Restart KRX Cartoon Studio. Voices appear as 'Piper ru_RU-...' in Script panel."
