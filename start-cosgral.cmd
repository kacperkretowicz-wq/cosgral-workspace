@echo off
rem COSGRAL Workspace: starts the program from this folder on your normal Windows profile.
rem Your data is then in %APPDATA%\COSGRAL Workspace Dev and %USERPROFILE%\COSGRAL Workspace (see README_URUCHOMIENIE.md).
rem   start-cosgral.cmd             start (builds the program once when it was never built)
rem   start-cosgral.cmd --rebuild   build again first (after you changed or updated the code)
rem An optional cosgral-local.cmd next to this file (ignored by git) may set COSGRAL_CODEX_PATH / COSGRAL_CLAUDE_PATH
rem and extend PATH, for example: set "COSGRAL_CODEX_PATH=C:\tools\codex-cli\node_modules\.bin\codex.cmd"
setlocal
cd /d "%~dp0"

if exist "cosgral-local.cmd" call "cosgral-local.cmd"
if defined COSGRAL_CODEX_PATH set "OPENBOT_CODEX_PATH=%COSGRAL_CODEX_PATH%"
if defined COSGRAL_CLAUDE_PATH set "OPENBOT_CLAUDE_PATH=%COSGRAL_CLAUDE_PATH%"

if not exist "node_modules\electron\dist\electron.exe" goto not_installed

set "REBUILD="
if /i "%~1"=="--rebuild" set "REBUILD=1"
if not exist "out\main\index.js" set "REBUILD=1"
if not defined REBUILD goto run
where bun >nul 2>&1
if errorlevel 1 goto no_bun
echo Building the program ^(bun run build^)...
call bun run build
if errorlevel 1 goto build_failed

:run
start "" "node_modules\electron\dist\electron.exe" .
goto done

:not_installed
echo The program is not installed yet. Run "bun install" in this folder, then start again.
pause
exit /b 1
:no_bun
echo Bun was not found on PATH, so the program cannot be built. Install Bun or add it to PATH, then start again.
pause
exit /b 1
:build_failed
echo The build failed. Nothing was started.
pause
exit /b 1
:done
endlocal
