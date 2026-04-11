@echo off
setlocal
cd /d "%~dp0"

echo.
echo   ██╗   ██╗██╗   ██╗██╗     ██╗  ██╗ █████╗ ███╗   ██╗
echo   ██║   ██║██║   ██║██║     ██║ ██╔╝██╔══██╗████╗  ██║
echo   ██║   ██║██║   ██║██║     █████╔╝ ███████║██╔██╗ ██║
echo   ╚██╗ ██╔╝██║   ██║██║     ██╔═██╗ ██╔══██║██║╚██╗██║
echo    ╚████╔╝ ╚██████╔╝███████╗██║  ██╗██║  ██║██║ ╚████║
echo     ╚═══╝   ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
echo.
echo   Agent Command Center — Swarm Initialization
echo   ─────────────────────────────────────────────
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
start "Vulkan Backend" /min cmd /c "cd /d "%~dp0backend" && node server.js"

:: ── Start Frontend ──
echo   [4/4] Starting frontend on port 5173...
start "Vulkan Frontend" /min cmd /c "cd /d "%~dp0" && npx vite --host"

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

echo   Vulkan is operational. Press any key to shut down both servers.
pause > nul

echo.
echo   Shutting down...
taskkill /fi "WINDOWTITLE eq Vulkan Backend" /f > nul 2>&1
taskkill /fi "WINDOWTITLE eq Vulkan Frontend" /f > nul 2>&1
echo   All systems terminated.
