@echo off
chcp 65001
cd /d "%~dp0"
powershell.exe -Command "Get-ChildItem -Path '.\' -Filter '*.ps1' | Unblock-File"
fltmc >nul 2>&1 || (
    echo 正在请求管理员权限...
    powershell -Command "Start-Process cmd -ArgumentList '/c ""%~f0""' -Verb RunAs"
    exit
)
powershell.exe -ExecutionPolicy Bypass -File ".\server.ps1"
