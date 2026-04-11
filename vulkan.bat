@echo off
setlocal
:: Capture the directory where the user typed 'vulkan'
set "VULKAN_CWD=%CD%"
:: Store the project root directory
set "PROJECT_ROOT=%~dp0"
:: Launch the project's start script
call "%PROJECT_ROOT%start_vulkan.bat"
