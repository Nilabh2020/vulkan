@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: ── Cleanup Previous Instances ──
echo [SYSTEM] Cleaning up existing Vulkan processes...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*server.js*' -or $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process $_.ProcessId -Force }" > nul 2>&1

:: ── Global Command Setup (Safe PowerShell Method) ──
echo %PATH% | findstr /C:"%~dp0" >nul
if %errorlevel% neq 0 (
    echo [SETUP] Adding "vulkan" command to your system PATH safely...
    powershell -Command "$p = [Environment]::GetEnvironmentVariable('Path', 'User'); if ($p -notlike '*%~dp0*') { [Environment]::SetEnvironmentVariable('Path', $p.TrimEnd(';') + ';%~dp0', 'User') }"
    echo [SETUP] Success! You can now type 'vulkan' in any NEW terminal.
    echo.
)

:: Use %CD% if %VULKAN_CWD% isn't set (e.g. if start_vulkan.bat is run directly)
if "%VULKAN_CWD%"=="" set "VULKAN_CWD=%CD%"

echo.
echo   VULKAN AGENT COMMAND CENTER
echo   ───────────────────────────
echo   Active Work Dir: %VULKAN_CWD%
echo.

:: ── Backend Dependencies ──
echo   [1/4] Checking backend dependencies...
cd backend
if not exist node_modules (
    echo         Installing backend packages...
    call npm install
)
cd ..

:: ── Frontend Dependencies ──
echo   [2/4] Checking frontend dependencies...
if not exist node_modules (
    echo         Installing frontend packages...
    call npm install
)

:: ── Start Backend ──
echo   [3/4] Starting backend on port 3001...
:: Pass the work dir as an argument to server.js
start /b cmd /c "cd /d "%~dp0backend" && node server.js "%VULKAN_CWD%""

:: ── Start Frontend ──
echo   [4/4] Starting frontend on port 5173...
start /b cmd /c "cd /d "%~dp0" && npx vite --host"

echo.
echo   Waiting for servers to initialize...
timeout /t 5 /nobreak > nul

echo.
echo   ┌─────────────────────────────────────────┐
echo   │  Backend:   http://127.0.0.1:3001       │
echo   │  Frontend:  http://localhost:5173        │
echo   └─────────────────────────────────────────┘
echo.

start http://localhost:5173

echo   Vulkan is operational. 
echo   (Logs will appear above. Use Ctrl+C or press any key to shut down.)
pause > nul

echo.
echo   Shutting down processes...
powershell -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*server.js*' -or $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process $_.ProcessId -Force }" > nul 2>&1

echo   All systems terminated.
