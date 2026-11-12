<#
.SYNOPSIS
  COSGRAL Workspace: from zero to a running instance (server or Electron window) on Windows.

.DESCRIPTION
  One checkout = one isolated Paperclip instance (own PAPERCLIP_HOME, server port,
  embedded Postgres port, persistent JWT/signing secrets). Uses the built-in
  Paperclip worktree support: `paperclipai worktree init --empty` writes
  <repo>\.paperclip\config.json + .env (git-ignored), and the server picks them up
  from its working directory.

  Steps (each one is skipped when already done):
    1. PATH: portable Node/Git from <Shared>\tools, pnpm shims in <DataHome>\bin
    2. pnpm install --frozen-lockfile        (when node_modules is missing or -Install)
       + build @paperclipai/plugin-sdk          (the only workspace package consumed from dist)
    3. paperclipai worktree init --empty      (when .paperclip\config.json is missing)
    4. vite build of ui\dist                  (when ui\dist\index.html is missing or -BuildUi)
    5. Mode server  : start the API (+UI) on 127.0.0.1:<ServerPort>, wait for /api/health
       Mode electron: start app-shell; it starts the API itself and opens the window
       Mode init    : stop after step 4
       Mode stop    : stop what -Background started (window close or server + clean pg_ctl stop)

.EXAMPLE
  # Backend instance, Electron window (first run ~25 min, then ~1 min)
  .\scripts\cosgral-instance.ps1 -Name backend -ServerPort 3110 -DbPort 54340

.EXAMPLE
  # UI Designer instance, API only, in the background
  .\scripts\cosgral-instance.ps1 -Name ui -ServerPort 3120 -DbPort 54350 -Mode server -Background

.EXAMPLE
  # Stop it again (clean Postgres shutdown)
  .\scripts\cosgral-instance.ps1 -Name ui -Mode stop
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9][a-z0-9_-]*$')][string]$Name,
  [ValidateRange(1024, 65535)][int]$ServerPort,
  [ValidateRange(1024, 65535)][int]$DbPort,
  [ValidateSet('electron', 'server', 'init', 'stop')][string]$Mode = 'electron',
  [string]$DataHome,
  [string]$SharedDir,
  [switch]$Install,
  [switch]$BuildUi,
  [switch]$Background,
  [int]$HealthTimeoutSec = 600
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Write-Step([string]$text) { Write-Host "[cosgral] $text" -ForegroundColor Cyan }

function Find-SharedDir([string]$start) {
  $dir = $start
  while ($dir) {
    if (Test-Path (Join-Path $dir 'tools\node\node.exe')) { return $dir }
    $parent = Split-Path $dir -Parent
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  return $null
}

function Invoke-Checked([string]$what, [scriptblock]$block) {
  & $block
  if ($LASTEXITCODE -ne 0) { throw "$what failed (exit $LASTEXITCODE)" }
}

# Start without inheriting this shell's handles (Start-Process -Redirect* does
# inherit them, so a caller that captures output would wait for the server to
# exit). cmd.exe redirects the output; the returned process is that cmd.exe.
function Start-Detached([string]$exe, [string[]]$argList, [string]$workDir, [string]$out, [string]$err) {
  $quoted = ($argList | ForEach-Object { '"' + $_ + '"' }) -join ' '
  $cmdLine = '/d /s /c ""' + $exe + '" ' + $quoted + ' > "' + $out + '" 2> "' + $err + '""'
  return Start-Process -FilePath $env:ComSpec -ArgumentList $cmdLine -WorkingDirectory $workDir -WindowStyle Hidden -PassThru
}

function Get-DescendantIds([int]$rootId) {
  $all = @(Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name)
  $ids = New-Object System.Collections.Generic.List[object]
  $queue = New-Object System.Collections.Generic.Queue[int]
  $queue.Enqueue($rootId)
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    foreach ($child in ($all | Where-Object { $_.ParentProcessId -eq $current })) {
      $ids.Add($child)
      $queue.Enqueue([int]$child.ProcessId)
    }
  }
  return $ids
}

function Wait-Exit([int]$id, [int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) { Start-Sleep -Milliseconds 500 }
  return -not (Get-Process -Id $id -ErrorAction SilentlyContinue)
}

function Test-Health([int]$port) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:$port/api/health"
    return $r.StatusCode -eq 200
  } catch { return $false }
}

# --- 1. tools --------------------------------------------------------------
if (-not $SharedDir) { $SharedDir = Find-SharedDir $repoRoot }
if (-not $SharedDir) { throw "Cannot find <Shared>\tools\node\node.exe above $repoRoot. Pass -SharedDir." }
if (-not $DataHome) { $DataHome = Join-Path $SharedDir "cosgral-data\$Name" }
$nodeDir = Join-Path $SharedDir 'tools\node'
$gitCmd = Join-Path $SharedDir 'tools\git\cmd'
$binDir = Join-Path $DataHome 'bin'
$logDir = Join-Path $DataHome 'logs'
New-Item -ItemType Directory -Force $binDir, $logDir | Out-Null
$env:PATH = "$binDir;$nodeDir;$gitCmd;$env:PATH"
$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
if (-not (Test-Path (Join-Path $binDir 'pnpm.CMD'))) {
  Write-Step "pnpm shims -> $binDir"
  Invoke-Checked 'corepack enable' { corepack enable --install-directory $binDir pnpm }
}
$nodeExe = Join-Path $nodeDir 'node.exe'
Write-Step ("node {0}, pnpm {1}, data {2}" -f (& $nodeExe -v), (pnpm --version), $DataHome)
$serverPidFile = Join-Path $DataHome 'server.pid'
$serverStopFile = Join-Path $DataHome 'server.stop'
$electronPidFile = Join-Path $DataHome 'electron.pid'

# --- stop ------------------------------------------------------------------
if ($Mode -eq 'stop') {
  if (Test-Path $electronPidFile) {
    $root = [int](Get-Content $electronPidFile)
    $shellIds = @(Get-DescendantIds $root | Where-Object { $_.Name -eq 'electron.exe' } | ForEach-Object { [int]$_.ProcessId })
    if ($shellIds.Count -gt 0) {
      # Window close request; the shell asks its backend for an ordered shutdown.
      Write-Step "closing Electron window (pid $($shellIds[0]))"
      & taskkill.exe /PID $shellIds[0] 2>$null | Out-Null
    }
    if (-not (Wait-Exit $root 45)) { Write-Warning "Electron still running (pid $root); close the window by hand." }
    Remove-Item $electronPidFile -Force -ErrorAction SilentlyContinue
  }
  if (Test-Path $serverPidFile) {
    $root = [int](Get-Content $serverPidFile)
    if (Get-Process -Id $root -ErrorAction SilentlyContinue) {
      # backend-entry.mjs watches this file and runs the server's own SIGTERM
      # shutdown (embedded Postgres stops via pg_ctl).
      Write-Step 'requesting ordered server shutdown'
      Set-Content -Path $serverStopFile -Value 'stop' -Encoding ascii
      if (-not (Wait-Exit $root 45)) {
        Write-Warning 'server did not stop in 45 s; killing it (next start cleans up Postgres)'
        & taskkill.exe /PID $root /T /F 2>$null | Out-Null
      }
    }
    Remove-Item $serverPidFile, $serverStopFile -Force -ErrorAction SilentlyContinue
  }
  Write-Step 'stopped'
  return
}

Push-Location $repoRoot
try {
  # --- 2. dependencies -----------------------------------------------------
  if ($Install -or -not (Test-Path 'node_modules\.modules.yaml')) {
    Write-Step 'pnpm install --frozen-lockfile (first time ~20 min)'
    Invoke-Checked 'pnpm install' { pnpm install --frozen-lockfile }
  }

  # The server runs from sources (tsx), but @paperclipai/plugin-sdk is only
  # consumed from dist. `build` also builds @paperclipai/shared.
  if (-not (Test-Path 'packages\plugins\sdk\dist\index.js')) {
    Write-Step 'build @paperclipai/plugin-sdk (+shared), ~30 s'
    Invoke-Checked 'plugin-sdk build' { pnpm --filter @paperclipai/plugin-sdk build }
  }

  # --- 3. isolated instance ------------------------------------------------
  $configPath = Join-Path $repoRoot '.paperclip\config.json'
  if (-not (Test-Path $configPath)) {
    if (-not $ServerPort -or -not $DbPort) { throw 'First run needs -ServerPort and -DbPort (e.g. ui: 3120/54350, tester: 3130/54360).' }
    Write-Step "worktree init: instance=$Name server=$ServerPort db=$DbPort home=$DataHome"
    Invoke-Checked 'worktree init' {
      pnpm paperclipai worktree init --empty --name $Name --instance $Name --home $DataHome `
        --server-port $ServerPort --db-port $DbPort
    }
    # Private team instance: no upstream telemetry or update checks.
    Invoke-Checked 'disable telemetry' {
      & $nodeExe -e "const fs=require('fs');const p=process.argv[1];const c=JSON.parse(fs.readFileSync(p,'utf8'));c.telemetry={...c.telemetry,enabled:false};c.updates={...c.updates,checkEnabled:false};fs.writeFileSync(p,JSON.stringify(c,null,2)+'\n')" $configPath
    }
  }
  $config = Get-Content $configPath -Raw | ConvertFrom-Json
  $port = [int]$config.server.port
  if ($ServerPort -and $port -ne $ServerPort) { Write-Warning "Instance already uses server port $port (config); -ServerPort $ServerPort ignored." }
  Write-Step "instance config: $configPath (server $port, db $($config.database.embeddedPostgresPort))"

  # --- 4. UI bundle ----------------------------------------------------------
  if ($BuildUi -or -not (Test-Path 'ui\dist\index.html')) {
    Write-Step 'vite build ui (first time ~5-10 min)'
    Invoke-Checked 'ui build' { pnpm --filter @paperclipai/ui build }
  }
  if ($Mode -eq 'init') { Write-Step 'init done'; return }

  if (Test-Health $port) { Write-Step "already healthy on http://127.0.0.1:$port"; }

  # --- 5a. server only -------------------------------------------------------
  if ($Mode -eq 'server') {
    if (Test-Health $port) { return }
    $env:HOST = '127.0.0.1'
    $env:PORT = "$port"
    $env:SERVE_UI = 'true'
    $env:PAPERCLIP_MIGRATION_AUTO_APPLY = 'true'
    $env:PAPERCLIP_MIGRATION_PROMPT = 'never'
    $tsxCli = Join-Path $repoRoot 'server\node_modules\tsx\dist\cli.mjs'
    $entry = Join-Path $repoRoot 'app-shell\src\backend-entry.mjs'
    $nodeArgs = @($tsxCli, $entry, (Join-Path $repoRoot 'server\src\index.ts'))
    if ($Background) {
      $out = Join-Path $logDir 'server.out.log'
      $err = Join-Path $logDir 'server.err.log'
      $env:COSGRAL_STOP_FILE = $serverStopFile
      $proc = Start-Detached $nodeExe $nodeArgs (Join-Path $repoRoot 'server') $out $err
      Set-Content -Path $serverPidFile -Value $proc.Id -Encoding ascii
      Write-Step "server pid $($proc.Id); logs $out"
      $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
      while ((Get-Date) -lt $deadline) {
        if (Test-Health $port) { Write-Step "healthy: http://127.0.0.1:$port/api/health"; return }
        if ($proc.HasExited) { throw "server exited with code $($proc.ExitCode); see $err" }
        Start-Sleep -Seconds 2
      }
      throw "server not healthy after $HealthTimeoutSec s; see $out"
    }
    Push-Location (Join-Path $repoRoot 'server')
    try { & $nodeExe @nodeArgs } finally { Pop-Location }
    return
  }

  # --- 5b. Electron window ---------------------------------------------------
  $shellDir = Join-Path $repoRoot 'app-shell'
  Push-Location $shellDir
  try {
    if (-not (Test-Path 'node_modules\electron\package.json')) {
      Write-Step 'npm ci (app-shell)'
      Invoke-Checked 'npm ci' { npm ci --no-audit --no-fund }
    }
    if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) {
      # npm >= 11 skips unapproved install scripts; fetch the Electron binary explicitly.
      Write-Step 'download Electron binary'
      Invoke-Checked 'electron install' { & $nodeExe 'node_modules\electron\install.js' }
    }
    $env:COSGRAL_NODE = $nodeExe
    $env:COSGRAL_INSTANCE = $Name
    $electron = Join-Path $shellDir 'node_modules\electron\dist\electron.exe'
    if ($Background) {
      $out = Join-Path $logDir 'electron.out.log'
      $err = Join-Path $logDir 'electron.err.log'
      $proc = Start-Detached $electron @('.') $shellDir $out $err
      Set-Content -Path $electronPidFile -Value $proc.Id -Encoding ascii
      Write-Step "electron pid $($proc.Id); logs $out"
      $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
      while ((Get-Date) -lt $deadline) {
        if (Test-Health $port) { Write-Step "window up, backend healthy: http://127.0.0.1:$port/api/health"; return }
        if ($proc.HasExited) { throw "electron exited with code $($proc.ExitCode); see $out" }
        Start-Sleep -Seconds 2
      }
      throw "backend not healthy after $HealthTimeoutSec s; see $out"
    }
    & $electron .
  } finally { Pop-Location }
} finally {
  Pop-Location
}
