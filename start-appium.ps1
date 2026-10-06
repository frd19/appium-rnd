# start-appium.ps1
# ------------------------------------------------------------------
# Starts the Appium server with the correct Android SDK settings.
#
# WHY THIS SCRIPT IS NEEDED
#   Appium fails with this error if ANDROID_HOME is not set:
#     "Neither ANDROID_HOME nor ANDROID_SDK_ROOT environment
#      variable was exported"
#
#   Running plain `appium` does NOT set it, so use this script
#   instead.
#
# HOW TO USE
#   Terminal 1:  .\start-appium.ps1
#   Terminal 2:  node tests\smoke.js
#
# Leave terminal 1 open while tests run.
# ------------------------------------------------------------------

# --- 1. Point to the Android SDK -----------------------------------
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

if (-not (Test-Path $sdk)) {
    Write-Host ""
    Write-Host "ERROR: Android SDK not found at $sdk" -ForegroundColor Red
    Write-Host "Edit this script and set `$sdk to your SDK location." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to close"
    exit 1
}

$env:ANDROID_HOME      = $sdk
$env:ANDROID_SDK_ROOT  = $sdk
$env:PATH              = "$sdk\platform-tools;$sdk\emulator;$env:PATH"

Write-Host ""
Write-Host "Android SDK : $sdk" -ForegroundColor Green
Write-Host "Device      :" -NoNewline
& "$sdk\platform-tools\adb.exe" devices | Select-Object -Skip 1 | ForEach-Object {
    if ($_.Trim()) { Write-Host $_ -ForegroundColor Green }
}
Write-Host ""
Write-Host "Starting Appium on port 4723. Keep this window open." -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

# --- 2. Start Appium ------------------------------------------------
appium