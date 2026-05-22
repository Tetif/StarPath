# StarPath - one-command stack launcher (Windows)
# Usage: .\start.ps1
#        .\start.ps1 -Docker   # full stack via Docker Compose

param(
    [switch]$Docker,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$VenvCelery = Join-Path $Root ".venv\Scripts\celery.exe"
$VenvUvicorn = Join-Path $Root ".venv\Scripts\uvicorn.exe"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Test-Command($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Invoke-Quiet {
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Script
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Script
        return $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prev
    }
}

function Test-TcpPort {
    param(
        [string]$HostName = "127.0.0.1",
        [int]$Port,
        [int]$TimeoutMs = 500
    )
    $client = $null
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $async = $client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $async.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
            return $false
        }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        if ($client) { $client.Dispose() }
    }
}

function Test-DockerDaemon {
    if (-not (Test-Command "docker")) { return $false }
    return (Invoke-Quiet { docker info 2>$null | Out-Null }) -eq 0
}

function Start-DockerDesktopIfNeeded {
    if (Test-DockerDaemon) { return $true }

    $candidates = @(
        "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe"
    )
    $dockerDesktop = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $dockerDesktop) { return $false }

    Write-Host "Docker Desktop is not running. Starting it..." -ForegroundColor Yellow
    Start-Process $dockerDesktop | Out-Null

    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        if (Test-DockerDaemon) {
            Write-Host "Docker Desktop is ready." -ForegroundColor Green
            return $true
        }
    }

    return $false
}

function Wait-RedisPort {
    param([int]$TimeoutSec = 30)
    for ($i = 0; $i -lt $TimeoutSec; $i++) {
        if (Test-TcpPort -Port 6379) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Ensure-Redis {
    if (Test-TcpPort -Port 6379) {
        Write-Host "Redis already available on localhost:6379" -ForegroundColor Green
        return
    }

    if (-not (Test-Command "docker")) {
        Write-Host "ERROR: Redis is not running and Docker is not installed." -ForegroundColor Red
        Write-Host "       Install Docker Desktop or start Redis on port 6379 manually."
        exit 1
    }

    if (-not (Start-DockerDesktopIfNeeded)) {
        Write-Host "ERROR: Docker Desktop is not running and could not be started." -ForegroundColor Red
        Write-Host "       Start Docker Desktop manually, then run .\start.ps1 again."
        exit 1
    }

    Invoke-Quiet { docker rm -f starpath-redis 2>$null | Out-Null } | Out-Null
    $code = Invoke-Quiet { docker run -d --name starpath-redis -p 6379:6379 redis:7-alpine 2>&1 | Out-Null }
    if ($code -ne 0) {
        Write-Host "ERROR: Failed to start Redis container. Is port 6379 free?" -ForegroundColor Red
        Write-Host "       Try: docker rm -f starpath-redis; docker run -d --name starpath-redis -p 6379:6379 redis:7-alpine"
        exit 1
    }

    if (-not (Wait-RedisPort)) {
        Write-Host "ERROR: Redis container started but port 6379 is not responding." -ForegroundColor Red
        exit 1
    }

    Write-Host "Redis OK on localhost:6379" -ForegroundColor Green
}

function Start-ServiceWindow {
    param(
        [string]$Name,
        [int]$Port,
        [string]$Command
    )
    if ($Port -gt 0 -and (Test-TcpPort -Port $Port)) {
        Write-Host "$Name already running on port $Port (skipping new window)" -ForegroundColor Green
        return
    }
    Write-Step "Starting $Name (new window)"
    Start-Process powershell -ArgumentList @("-NoExit", "-Command", $Command)
}

function Stop-StarPathWorkers {
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -like "*StarPath*" -and
            $_.CommandLine -match "celery|uvicorn"
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    Get-Process -Name "celery", "uvicorn" -ErrorAction SilentlyContinue |
        Stop-Process -Force -ErrorAction SilentlyContinue
}

function Stop-StarPath {
    Write-Step "Stopping StarPath processes..."
    if (Test-DockerDaemon) {
        Invoke-Quiet { docker stop starpath-redis 2>$null | Out-Null } | Out-Null
        Invoke-Quiet { docker rm starpath-redis 2>$null | Out-Null } | Out-Null
    }
    Stop-StarPathWorkers
    Write-Host "Done." -ForegroundColor Green
}

if ($Stop) {
    Stop-StarPath
    exit 0
}

if ($Docker) {
    Write-Step "Starting full stack via Docker Compose"
    if (-not (Test-Path (Join-Path $Root ".env"))) {
        Copy-Item (Join-Path $Root ".env.example") (Join-Path $Root ".env")
        Write-Host "Created .env from .env.example."
    }
    if (-not (Start-DockerDesktopIfNeeded)) {
        Write-Host "ERROR: Docker Desktop is not running." -ForegroundColor Red
        exit 1
    }
    Set-Location $Root
    docker compose up --build
    exit $LASTEXITCODE
}

# --- Local dev mode ---

Write-Host ""
Write-Host "  StarPath local launcher" -ForegroundColor Yellow
Write-Host "  -----------------------" -ForegroundColor Yellow
Write-Host "  Redis  -> localhost:6379 (Docker or existing instance)" -ForegroundColor Yellow
Write-Host "  Worker -> Celery (solo pool, Windows)" -ForegroundColor Yellow
Write-Host "  API    -> http://localhost:8000" -ForegroundColor Yellow
Write-Host "  UI     -> http://localhost:5173" -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $VenvPython)) {
    Write-Host "ERROR: .venv not found. Run: python -m venv .venv; .venv\Scripts\pip install -e backend[dev]" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $Root ".env"))) {
    Copy-Item (Join-Path $Root ".env.example") (Join-Path $Root ".env")
    Write-Host "Created .env from .env.example"
}

Write-Step "Starting Redis"
Ensure-Redis

Write-Step "Checking backend install"
Set-Location (Join-Path $Root "backend")
& $VenvPython -m pip install -e ".[dev]" -q
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Step "Checking frontend install"
Set-Location (Join-Path $Root "frontend")
if (-not (Test-Path "node_modules")) {
    npm install
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"

$env:REDIS_URL = "redis://localhost:6379/0"
$env:CELERY_BROKER_URL = "redis://localhost:6379/0"
$env:CELERY_RESULT_BACKEND = "redis://localhost:6379/1"
$env:CZML_STORAGE_DIR = Join-Path $Root "backend\data\czml"

New-Item -ItemType Directory -Force -Path $env:CZML_STORAGE_DIR | Out-Null

Write-Step "Stopping stale StarPath workers"
Stop-StarPathWorkers
Start-Sleep -Seconds 1

$celeryCmd = "cd '$BackendDir'; `$env:REDIS_URL='redis://localhost:6379/0'; `$env:CELERY_BROKER_URL='redis://localhost:6379/0'; `$env:CELERY_RESULT_BACKEND='redis://localhost:6379/1'; `$env:CZML_STORAGE_DIR='$($env:CZML_STORAGE_DIR)'; & '$VenvCelery' -A app.tasks.celery_app worker -Q calculations -P solo -c 1 --loglevel=info"
$apiCmd = "cd '$BackendDir'; `$env:REDIS_URL='redis://localhost:6379/0'; `$env:CELERY_BROKER_URL='redis://localhost:6379/0'; `$env:CELERY_RESULT_BACKEND='redis://localhost:6379/1'; `$env:CZML_STORAGE_DIR='$($env:CZML_STORAGE_DIR)'; & '$VenvUvicorn' app.main:app --reload --port 8000"
$frontendCmd = "cd '$FrontendDir'; npm run dev"

Start-ServiceWindow -Name "Celery worker" -Port 0 -Command $celeryCmd
Start-ServiceWindow -Name "API" -Port 8000 -Command $apiCmd
Start-ServiceWindow -Name "frontend" -Port 5173 -Command $frontendCmd

Set-Location $Root

Write-Host ""
Write-Host "All services started in separate windows." -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend:  http://localhost:5173" -ForegroundColor Green
Write-Host "  API docs:  http://localhost:8000/docs" -ForegroundColor Green
Write-Host "  Health:    http://localhost:8000/health" -ForegroundColor Green
Write-Host ""
Write-Host "Stop Redis:  .\start.ps1 -Stop" -ForegroundColor Green
Write-Host "Full Docker: .\start.ps1 -Docker" -ForegroundColor Green
Write-Host ""
