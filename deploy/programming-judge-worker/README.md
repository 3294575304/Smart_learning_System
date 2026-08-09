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

本地开发可把 `SANDBOX_EXECUTOR_URL` 指向 SSH 隧道；云端使用同区域私网或受限 TLS。生产默认只启动一个 worker，执行器也保持 `maxConcurrency=1`。worker 周期性恢复过期租约；网络或进程重启后，数据库任务会重试。执行器重启导致执行 ID 丢失时，worker 使用同一 `requestId` 重投；最终投影仍受数据库租约和幂等约束，不会重复写入终态。
