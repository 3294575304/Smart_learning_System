# Windows 本机部署

本目录用于把 Next.js 应用和 Python 判题 worker 运行在当前 Windows 电脑上，复用已经作为 Windows 服务运行的本机 PostgreSQL，并通过常驻 SSH 隧道访问远程 gVisor 执行器。

拓扑：

```text
浏览器 -> localhost:3000 Next.js (::1) -> PostgreSQL 127.0.0.1:5432
                                  -> 本机判题 worker
                                  -> SSH 127.0.0.1:18788
                                  -> 远程 gVisor 127.0.0.1:8788
```

安装脚本默认先把生产应用构建到独立的 `.data/next-production`，再构建 worker、注册无触发器的手动任务并启动。该目录不与日常 `npm run dev` 使用的 `.next` 共用，避免开发服务器覆盖生产 manifest。数据库 migration 需先完成：

```powershell
npx prisma migrate deploy
```

手动准备并启动三个本地任务：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/windows-local/install-local-deployment.ps1
```

仅在已经确认独立生产构建完整、只需重启或更新任务设置时，才可传入 `-SkipBuild`。

任务分别为 `Zhixue-SSH-Tunnel`、`Zhixue-Next` 和 `Zhixue-Judge-Worker`。它们不注册登录、定时或失败重启触发器，只在运行启动脚本时启动；停止后不会自行恢复。任务通过 `IgnoreNew` 保持单实例。运行时配置保存在被 Git 忽略的 `.data/local-deployment/service-config.json`，安装脚本会为该文件单独关闭 ACL 继承，仅允许当前用户和 SYSTEM 读取；日志保存在同目录的 `logs` 下。脚本不会输出远程执行器密钥或后台任务密钥。

仓库根目录提供成对的手动命令：

```powershell
# 构建（或复用构建）并启动
powershell -ExecutionPolicy Bypass -File .\start-all.ps1

# 停止应用、worker 和 SSH 隧道
powershell -ExecutionPolicy Bypass -File .\stop-all.ps1
```

重新登录或重启 Windows 后任务保持停止，需再次手动执行 `start-all.ps1`。如果未来确实需要无人登录自启，应另行设计服务账户和 ACL，不应在手动部署脚本中隐式启用。

健康检查：

```powershell
Get-ScheduledTask -TaskName 'Zhixue-*' | Select-Object TaskName,State
Invoke-WebRequest http://localhost:3000/login -UseBasicParsing
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3000,5432,18788
```
