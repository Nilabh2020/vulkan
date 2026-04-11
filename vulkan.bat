@echo off
setlocal
:: Store the project root directory
set "PROJECT_ROOT=%~dp0"
:: Launch the project's start script
call "%PROJECT_ROOT%start_vulkan.bat"
