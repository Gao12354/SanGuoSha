# 抑制所有非预期输出 + 设置 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$is_first = -not (Test-Path ".\node_modules")

if ($is_first) {
    Write-Host "[Info] 首次启动, 检查环境..." -ForegroundColor Cyan

    # 静默检测 Node.js
    $nodeVersion = & node.exe -v 2>$null
    if ($nodeVersion) {
        Write-Host "[Info] Node.js 环境正常! ($nodeVersion)" -ForegroundColor Green
    } else {
        Write-Host "[Error] 未检测到 Node.js! 请先访问 https://nodejs.org/zh-cn/download 下载" -ForegroundColor Red
        Pause
        exit 1
    }

    # 静默添加防火墙规则（需管理员权限）
    Write-Host "[Info] 配置防火墙规则..." -ForegroundColor Gray
    if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
            ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        try{
        Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
        }
        catch {
            Write-Host "[Waring] 管理员权限获取失败" -ForegroundColor Yellow
            Write-Host "[Waring] 可能导致防火墙规则无法正确配置" -ForegroundColor Yellow
            Pause
        }
    }
    netsh advfirewall firewall add rule name="乱世弈界" dir=in action=allow protocol=TCP localport=3000 *> $null

    # 静默初始化项目并安装依赖
    Write-Host "[Info] 安装依赖中, 请稍候..." -ForegroundColor Gray
    npm init -y *> $null
    npm install express socket.io *> $null

    Write-Host "[Info] 环境准备完成!" -ForegroundColor Green
}

# 启动服务器
Write-Host "[Info] 正在启动服务器..." -ForegroundColor Gray
Start-Process node server.js
Write-Host "[Info] 服务器启动成功,5s后退出..." -ForegroundColor Green
Start-Sleep 5
exit 0