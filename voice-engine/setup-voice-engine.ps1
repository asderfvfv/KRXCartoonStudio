#requires -Version 5.1
param(
  [string]$PythonExe = "",
  [switch]$SkipSelfTest,
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$EngineRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvDir = Join-Path $EngineRoot ".venv"
$StatusFile = Join-Path $EngineRoot "setup-status.json"
$LogDir = Join-Path $EngineRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Find-Python311 {
  if ($PythonExe -and (Test-Path $PythonExe)) { return (Resolve-Path $PythonExe).Path }
  $candidates = @(
    "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
    "$env:ProgramFiles\Python311\python.exe",
    "C:\Python311\python.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { return $c }
  }
  $cmd = Get-Command python -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "Python 3.11 not found. Install Python 3.11 and re-run this script."
}

function Write-Status($obj) {
  ($obj | ConvertTo-Json -Depth 8) | Set-Content -Path $StatusFile -Encoding UTF8
}

Write-Step "Voice Engine setup - Chatterbox Multilingual (local)"
$py = Find-Python311
$verPy = Join-Path $LogDir "_pyver.py"
Set-Content -Path $verPy -Encoding UTF8 -Value "import sys`nprint('.'.join(map(str, sys.version_info[:3])))"
$ver = (& $py $verPy).Trim()
Write-Host "Python: $py ($ver)"
if (-not $ver.StartsWith("3.11")) {
  Write-Warning "Resemble AI develops Chatterbox on Python 3.11. Found $ver - continuing, but 3.11 is preferred."
}

Write-Step "GPU check (nvidia-smi)"
try {
  $gpuName = (nvidia-smi --query-gpu=name --format=csv,noheader 2>$null | Select-Object -First 1)
  if ($gpuName) { Write-Host ("GPU: " + $gpuName.Trim()) }
  nvidia-smi | Select-Object -First 12
} catch {
  Write-Warning "nvidia-smi failed: $_"
}

if ((Test-Path $VenvDir) -and $Force) {
  Write-Step "Removing existing .venv (-Force)"
  Remove-Item -Recurse -Force $VenvDir
}

if (-not (Test-Path (Join-Path $VenvDir "Scripts\python.exe"))) {
  Write-Step "Creating virtualenv"
  & $py -m venv $VenvDir
}

$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$VenvPip = Join-Path $VenvDir "Scripts\pip.exe"

Write-Step "Upgrading pip / wheel / setuptools"
& $VenvPython -m pip install --upgrade pip wheel
# resemble-perth imports pkg_resources; setuptools 82+ removed it from default installs.
& $VenvPip install "setuptools==69.5.1"

Write-Step "Installing PyTorch with CUDA wheels (cu124)"
& $VenvPip install --index-url https://download.pytorch.org/whl/cu124 torch torchaudio

Write-Step "Installing Chatterbox TTS (official GitHub master - Multilingual V3)"
& $VenvPip uninstall -y chatterbox-tts 2>$null
& $VenvPip install --no-cache-dir "git+https://github.com/resemble-ai/chatterbox.git@master"

Write-Step "Installing CTC Forced Aligner (Lip Sync, modular)"
& $VenvPip install --no-cache-dir "git+https://github.com/MahmoudAshraf97/ctc-forced-aligner.git"

Write-Step "Verifying torch CUDA"
$torchPy = Join-Path $LogDir "_check_torch.py"
@'
import json
import torch
print(json.dumps({
  "torch": torch.__version__,
  "cuda_available": bool(torch.cuda.is_available()),
  "cuda": str(torch.version.cuda),
  "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None
}))
'@ | Set-Content -Path $torchPy -Encoding UTF8
$torchCheck = & $VenvPython $torchPy
Write-Host $torchCheck
$torchObj = $torchCheck | ConvertFrom-Json
if (-not $torchObj.cuda_available) {
  Write-Warning "torch.cuda.is_available() is False. Generation may fall back to CPU (slow)."
}

$chatterboxVer = (& $VenvPython -c "import importlib.metadata as m; print(m.version('chatterbox-tts'))").Trim()
Write-Host "chatterbox-tts: $chatterboxVer"

$status = [ordered]@{
  ok = $true
  finishedAt = (Get-Date).ToString("o")
  python = $ver
  pythonPath = $VenvPython
  torch = $torchObj.torch
  cudaAvailable = [bool]$torchObj.cuda_available
  cuda = $torchObj.cuda
  gpu = $torchObj.gpu
  chatterbox = $chatterboxVer
  t3Model = "v3"
  hfRepo = "ResembleAI/chatterbox"
  selfTest = $null
}

if (-not $SkipSelfTest) {
  Write-Step "Self-test: load Multilingual V3 + Russian WAV (may download models once)"
  $outWav = Join-Path $LogDir "selftest-ru.wav"
  $selfPy = Join-Path $LogDir "_selftest.py"
  @"
import json
import sys
from pathlib import Path
sys.path.insert(0, r'$EngineRoot')
# Run worker handlers in-process for a reliable setup self-test
import worker

out = Path(r'$outWav')
result = worker.cmd_self_test({
  'out_path': str(out),
  'prefer_cuda': True,
  't3_model': 'v3',
  'text': 'Привет! Это локальный тест Chatterbox Multilingual.',
})
print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))
"@ | Set-Content -Path $selfPy -Encoding UTF8

  $stderrLog = Join-Path $LogDir "setup-selftest-stderr.txt"
  $stdoutLog = Join-Path $LogDir "setup-selftest-stdout.txt"
  $cmdLine = "`"$VenvPython`" -u `"$selfPy`""
  cmd.exe /c "$cmdLine > `"$stdoutLog`" 2> `"$stderrLog`""
  $selfExit = $LASTEXITCODE
  $selfOut = @()
  if (Test-Path $stdoutLog) { $selfOut = Get-Content -Path $stdoutLog -Encoding UTF8 }
  $okLine = $null
  foreach ($line in @($selfOut)) {
    if (-not $line) { continue }
    try {
      $j = $line | ConvertFrom-Json
      if ($j.ok -eq $true -and $j.result) { $okLine = $j; break }
    } catch { }
  }
  if (-not $okLine -or $selfExit -ne 0) {
    $status.ok = $false
    $status.selfTest = @{ ok = $false; error = "no ok JSON or exit $selfExit"; stdout = $stdoutLog; stderr = $stderrLog }
    Write-Status $status
    throw "Self-test failed. See $stderrLog"
  }
  $status.selfTest = @{
    ok = $true
    path = $okLine.result.path
    duration = $okLine.result.duration
    device = $okLine.result.device
    gpu = $okLine.result.gpu
  }
  Write-Host ("Self-test OK: " + $okLine.result.path + " on " + $okLine.result.device)
}

Write-Status $status
Write-Step "Setup complete"
Write-Host "Status written to $StatusFile"
Write-Host "Venv Python: $VenvPython"
exit 0
