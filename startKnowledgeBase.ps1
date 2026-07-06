# 个人知识库 - 启动脚本 (PowerShell)
# 右键 -> 用 PowerShell 运行，或在 cmd 里执行：powershell -ExecutionPolicy Bypass -File "启动知识库.ps1"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

$PythonExe = "C:\Users\20132\.workbuddy\binaries\python\versions\3.13.12\python.exe"
$PortFile = "server_port.txt"

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Personal Knowledge Base - Startup" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# 1. Kill existing python processes
Write-Host "[1/4] Stopping existing Python processes..." -ForegroundColor Yellow
Get-Process python -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process pythonw -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Clean up old port file
if (Test-Path $PortFile) { Remove-Item $PortFile -Force }

# 3. Start server
Write-Host "[2/4] Starting backend server..." -ForegroundColor Green
$ServerProc = Start-Process -FilePath $PythonExe -ArgumentList "server.py" -PassThru -WindowStyle Normal

# 4. Wait for server_port.txt
Write-Host "[3/4] Waiting for server to start..." -ForegroundColor Green
$Retries = 0
$Port = $null
do {
    Start-Sleep -Seconds 1
    $Retries++
    if (Test-Path $PortFile) {
        $Port = (Get-Content $PortFile -Encoding UTF8).Trim()
        if ($Port -match '^\d+$') { break }
    }
    Write-Host "  Waiting... ($Retries/15)" -ForegroundColor Gray
} while ($Retries -lt 15)

if (-not $Port) {
    Write-Host "[ERROR] Server failed to start. Check server.py for errors." -ForegroundColor Red
    Write-Host "Press any key to exit..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    exit 1
}

# 5. Open browser
$Url = "http://localhost:$Port/"
Write-Host "[4/4] Opening browser: $Url" -ForegroundColor Green
Start-Process $Url

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Server running at: $Url" -ForegroundColor Green
Write-Host "  Server PID: $($ServerProc.Id)" -ForegroundColor Gray
Write-Host "  Close the Python window to stop the server." -ForegroundColor Gray
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press any key to close this window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
