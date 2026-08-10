# Python 判题 worker 部署

该 worker 是 Next.js 应用与隔离执行器之间的独立生产进程。应用只把任务写入 PostgreSQL；worker 通过受保护的内部 API claim、续租和完成任务，再调用远程执行器。它不会在本机执行学生代码。

构建：

```bash
npm run build:programming-judge-worker
```

把 `.data/programming-judge-worker-build/*.js` 部署到 `/opt/zhixue-programming-judge-worker/`，创建无登录权限的 `zhixue-worker` 用户，安装本目录 systemd 单元，并将仅 root 可读（`0600`）的配置写入 `/etc/zhixue-programming-judge-worker.env`：

```text
APPLICATION_INTERNAL_URL=https://app.internal.example
BACKGROUND_JOB_WORKER_SECRET=<至少 32 字符>
SANDBOX_EXECUTOR_URL=http://executor.private:8788
SANDBOX_EXECUTOR_API_KEY=<至少 32 字符>
PROGRAMMING_JUDGE_WORKER_ID=judge-worker-1
PROGRAMMING_JUDGE_LEASE_DURATION_MS=30000
```

仓库提供可重复安装脚本。先把构建目录、环境文件和 systemd 单元安全复制到目标机的 `/tmp`，确保环境文件权限不宽于 `0600`，然后执行：

```bash
bash /tmp/install-worker-service.sh \
  /tmp/zhixue-programming-judge-worker-build \
  /tmp/zhixue-programming-judge-worker.env \
  /tmp/zhixue-programming-judge-worker.service
```

脚本会在写入系统目录前校验必需 URL 和两项至少 32 字符的密钥，使用 root 所有、`0600` 权限安装环境文件，并确认服务进入 `active`。脚本不会打印密钥值。

本地开发可把 `SANDBOX_EXECUTOR_URL` 指向 SSH 隧道；云端使用同区域私网或受限 TLS。生产默认只启动一个 worker，执行器也保持 `maxConcurrency=1`。worker 周期性恢复过期租约；网络或进程重启后，数据库任务会重试。执行器重启导致执行 ID 丢失时，worker 使用同一 `requestId` 重投；最终投影仍受数据库租约和幂等约束，不会重复写入终态。

真实纵向验收要求配置独立 `TEST_DATABASE_URL`，并把 `SANDBOX_EXECUTOR_URL` 指向真实远程执行器的私网/TLS 地址或一次性 SSH 隧道：

```bash
npm run test:programming-runtime
```

该命令会创建并自动删除隔离测试 schema，启动 Next.js 生产服务和独立 worker，验证公开运行、隐藏判题、成绩和课程 Concept 证据。禁止把 `TEST_DATABASE_URL` 指向开发库、预发布库或生产库。

上线后至少核对：

```bash
systemctl is-active zhixue-programming-judge-worker
journalctl -u zhixue-programming-judge-worker --since "10 minutes ago" --no-pager
```

日志只能用于确认启动、领取任务和脱敏错误类型，不得输出源代码、测试用例、学生身份或任何密钥。
