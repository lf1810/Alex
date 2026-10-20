@echo off
rem 双击即可用浏览器模式启动 影猫可视化编导台。
setlocal
where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-workbench-windows.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-workbench-windows.ps1"
)
