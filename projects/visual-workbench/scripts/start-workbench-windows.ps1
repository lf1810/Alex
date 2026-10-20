# 在 Windows 上启动 影猫可视化编导台（浏览器模式）
# 双击项目根目录的「启动编导台（浏览器版）.cmd」即可运行本脚本。
# 首次使用前请先在项目目录执行：pnpm install 和 pnpm check（生成构建产物）。
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:4317/"

# 1) 找 Node.js：优先用系统 PATH 里的 node，找不到再回退到作者机器的 DSH 运行时
$node = $null
$command = Get-Command node -ErrorAction SilentlyContinue
if ($command) {
  $node = $command.Source
}
if (-not $node) {
  $bundled = Join-Path $env:USERPROFILE ".dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
  if (Test-Path $bundled) { $node = $bundled }
}
if (-not $node) {
  Write-Host "没有找到 Node.js。请先安装 Node.js 20~24：https://nodejs.org" -ForegroundColor Red
  Read-Host "按回车关闭"
  exit 1
}

# 2) 检查依赖与构建产物，缺了就给出明确指引（不自动安装，避免双击时静默联网）
$missing = @()
if (-not (Test-Path (Join-Path $root "node_modules"))) { $missing += "依赖未安装" }
if (-not (Test-Path (Join-Path $root "local-service\dist\server.js"))) { $missing += "本地服务未构建" }
if (-not (Test-Path (Join-Path $root "app\node_modules\vite\bin\vite.js"))) { $missing += "前端依赖缺失" }
if ($missing.Count -gt 0) {
  Write-Host ("还不能启动：" + ($missing -join "、")) -ForegroundColor Yellow
  Write-Host ""
  Write-Host "请在该目录打开 PowerShell，依次执行：" -ForegroundColor Cyan
  Write-Host "  pnpm install"
  Write-Host "  pnpm check"
  Write-Host ""
  Write-Host "装完再双击本脚本；也可以直接用 pnpm dev 启动。"
  Read-Host "按回车关闭"
  exit 1
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
  Write-Host "启动失败：请确认 4317 端口未被占用，或改用 pnpm dev 查看具体报错。" -ForegroundColor Red
  Read-Host "按回车关闭"
}
