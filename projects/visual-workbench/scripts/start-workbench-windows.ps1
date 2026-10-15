# 在 Windows 上启动 影猫可视化编导台（浏览器模式）
# 双击项目根目录的「启动编导台（浏览器版）.cmd」即可运行本脚本。
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:4317/"

$node = Join-Path $env:USERPROFILE ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if (-not (Test-Path $node)) {
  $command = Get-Command node -ErrorAction SilentlyContinue
  if (-not $command) {
    Write-Host "没有找到 Node.js，请先安装 Node.js 20~24。" -ForegroundColor Red
    Read-Host "按回车关闭"
    exit 1
  }
  $node = $command.Source
}

function Test-Workbench {
  try {
    Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-Workbench)) {
  Write-Host "正在启动编导台（本地服务 + 前端）…"
  Start-Process -FilePath $node `
    -ArgumentList (Join-Path $root "scripts\workbench-supervisor.mjs") `
    -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Workbench) { break }
  }
}

if (Test-Workbench) {
  Start-Process $url
  Write-Host "编导台已打开：$url"
  Start-Sleep -Seconds 2
} else {
  Write-Host "启动失败。请先在项目目录执行 pnpm install，或查看是否有端口占用。" -ForegroundColor Red
  Read-Host "按回车关闭"
}
