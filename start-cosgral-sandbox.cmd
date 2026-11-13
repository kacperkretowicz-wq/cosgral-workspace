@echo off
rem COSGRAL Workspace in a sandbox: its own data folder, its own (empty) Windows profile, and a stand-in for Codex.
rem No model, no account and no network are used, and nothing of your normal profile is read or written.
rem   start-cosgral-sandbox.cmd                  sandbox in %LOCALAPPDATA%\COSGRAL-Sandbox
rem   start-cosgral-sandbox.cmd "D:\my folder"   sandbox in another folder
rem   start-cosgral-sandbox.cmd --reset          delete the sandbox first (only a folder made by this script)
setlocal
rem Remember this folder now: SHIFT below also shifts %0, so %~dp0 would point somewhere else afterwards.
set "HERE=%~dp0"
cd /d "%HERE%"

set "RESET="
set "SANDBOX="
:arguments
if "%~1"=="" goto arguments_done
if /i "%~1"=="--reset" goto flag_reset
set "SANDBOX=%~1"
goto flag_next
:flag_reset
set "RESET=1"
:flag_next
shift
goto arguments
:arguments_done
if "%SANDBOX%"=="" set "SANDBOX=%LOCALAPPDATA%\COSGRAL-Sandbox"

if not exist "node_modules\electron\dist\electron.exe" goto not_installed
if exist "out\main\index.js" goto built
where bun >nul 2>&1
if errorlevel 1 goto no_bun
echo Building the program once ^(bun run build^)...
call bun run build
if errorlevel 1 goto build_failed
:built

if not defined RESET goto after_reset
if not exist "%SANDBOX%\.cosgral-sandbox" goto reset_refused
echo Deleting the sandbox in "%SANDBOX%"...
rmdir /s /q "%SANDBOX%"
goto after_reset
:reset_refused
echo "%SANDBOX%" was not made by this script, so it is left alone.
:after_reset

mkdir "%SANDBOX%\home\AppData\Roaming" 2>nul
mkdir "%SANDBOX%\home\AppData\Local" 2>nul
mkdir "%SANDBOX%\tmp" 2>nul
mkdir "%SANDBOX%\fixture" 2>nul
echo This folder belongs to start-cosgral-sandbox.cmd of COSGRAL Workspace.> "%SANDBOX%\.cosgral-sandbox"

rem The Codex stand-in answers like Codex, without a model: "Stub: received" for a plain message.
copy /y "src\backend\testing\channel-codex.cjs" "%SANDBOX%\fixture\codex.cjs" >nul
> "%SANDBOX%\fixture\codex.cmd" echo @echo off
>> "%SANDBOX%\fixture\codex.cmd" echo set ELECTRON_RUN_AS_NODE=1
>> "%SANDBOX%\fixture\codex.cmd" echo "%HERE%node_modules\electron\dist\electron.exe" "%%~dp0codex.cjs" %%*

set "USERPROFILE=%SANDBOX%\home"
set "HOME=%SANDBOX%\home"
set "APPDATA=%SANDBOX%\home\AppData\Roaming"
set "LOCALAPPDATA=%SANDBOX%\home\AppData\Local"
set "TEMP=%SANDBOX%\tmp"
set "TMP=%SANDBOX%\tmp"
set "OPENBOT_CODEX_PATH=%SANDBOX%\fixture\codex.cmd"
set "OPENBOT_CLAUDE_PATH=%SANDBOX%\fixture\missing-claude.exe"

echo COSGRAL Workspace sandbox: %SANDBOX%
start "" "node_modules\electron\dist\electron.exe" .
goto done

:not_installed
echo The program is not installed yet. Run "bun install" in this folder, then start again.
pause
exit /b 1
:no_bun
echo The program was never built and Bun was not found on PATH. Run "bun run build" first.
pause
exit /b 1
:build_failed
echo The build failed. Nothing was started.
pause
exit /b 1
:done
endlocal
