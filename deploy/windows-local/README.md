# Windows 本机部署

本目录用于把 Next.js 应用和 Python 判题 worker 运行在当前 Windows 电脑上，复用已经作为 Windows 服务运行的本机 PostgreSQL，并通过常驻 SSH 隧道访问远程 gVisor 执行器。

拓扑：

```text
浏览器 -> 127.0.0.1:3000 Next.js -> PostgreSQL 127.0.0.1:5432
                                  -> 本机判题 worker
                                  -> SSH 127.0.0.1:18788
                                  -> 远程 gVisor 127.0.0.1:8788
```

安装脚本默认先把生产应用构建到独立的 `.data/next-production`，再构建 worker、注册任务并启动。该目录不与日常 `npm run dev` 使用的 `.next` 共用，避免开发服务器覆盖生产 manifest。数据库 migration 需先完成：

```powershell
npx prisma migrate deploy
```

注册并立即启动三个当前用户登录任务：

```powershell
powershell -ExecutionPolicy Bypass -File deploy/windows-local/install-local-deployment.ps1
```

仅在已经确认独立生产构建完整、只需重启或更新任务设置时，才可传入 `-SkipBuild`。

任务分别为 `Zhixue-SSH-Tunnel`、`Zhixue-Next` 和 `Zhixue-Judge-Worker`。任务明确禁用“空闲结束时停止”，并配置失败重启，避免用户开始操作电脑后应用和 worker 被 Windows 同时终止。运行时配置保存在被 Git 忽略的 `.data/local-deployment/service-config.json`，安装脚本会为该文件单独关闭 ACL 继承，仅允许当前用户和 SYSTEM 读取；日志保存在同目录的 `logs` 下。脚本不会输出远程执行器密钥或后台任务密钥。

该方式使用当前 Windows 用户的“登录时”计划任务：当前会话立即启动，重新登录后自动恢复；如果要求无人登录也能在开机后运行，应由管理员把三个任务改为服务账户或 `SYSTEM` 启动，并重新核对 SSH 私钥和数据库目录 ACL。

健康检查：

```powershell
Get-ScheduledTask -TaskName 'Zhixue-*' | Select-Object TaskName,State
Invoke-WebRequest http://127.0.0.1:3000/login -UseBasicParsing
Get-NetTCPConnection -State Listen | Where-Object LocalPort -in 3000,5432,18788
```
