# 持久化长任务 worker

报告生成、知识图谱生成及 AI 增强、教学大纲解析和题目批量映射统一写入 `BackgroundJob`。独立 worker 直接连接 PostgreSQL、私有文件存储和统一 AI Service Layer；Web 请求只负责权限校验、冻结输入、持久化入队和返回 `202`。

Web 的 `after()` 只向 `BACKGROUND_LONG_TASK_WORKER_WAKE_URL` 发送一次带 worker 密钥的本机唤醒请求。唤醒失败不会丢任务，worker 会继续轮询数据库并周期性恢复过期租约。

## 构建与运行

```bash
npm run build:background-worker
node --conditions=react-server .data/background-worker-build/main.js
```

worker 从仓库 `.env` 和进程环境读取数据库、存储、AI 与下列专用配置：

```text
BACKGROUND_JOB_WORKER_SECRET=<至少 32 字符>
BACKGROUND_LONG_TASK_WORKER_ID=long-task-worker-1
BACKGROUND_LONG_TASK_WORKER_POLL_INTERVAL_MS=2000
BACKGROUND_LONG_TASK_WORKER_LEASE_DURATION_MS=120000
BACKGROUND_LONG_TASK_WORKER_RECOVERY_INTERVAL_MS=30000
BACKGROUND_LONG_TASK_WORKER_WAKE_PORT=18789
BACKGROUND_LONG_TASK_WORKER_WAKE_URL=http://127.0.0.1:18789/wake
```

唤醒监听只绑定 `127.0.0.1`，并使用常量时间比较校验 Bearer 密钥。生产环境不应把该端口暴露到公网。

Windows 本地生产部署脚本会构建并注册 `Zhixue-Background-Worker` 计划任务，日志分别写入 `background-worker.stdout.log` 和 `background-worker.stderr.log`。数据库 migration 会把升级时遗留的 `PENDING`/`PROCESSING` 大纲和图谱草稿转为可领取任务，无需教师重新点击。

## 恢复与幂等边界

- 所有任务使用 Attempt、租约、心跳、指数退避和最多三次执行；大纲 JSON/结构校验已经完成内部修复重试，最终仍无效时不再由后台任务整轮重试，避免重复调用 AI，只有 Provider 超时、暂时不可用、存储读取失败等瞬态错误才重试。
- 报告使用租约隔离的临时产物键，失去租约的执行不会删除新执行的文件。
- 题目映射候选与任务完成在同一事务提交，旧 worker 不能覆盖新结果。
- 图谱和大纲保存执行标识；接管时旧执行不能写回当前草稿。
- AI 失败继续遵守各领域既有确定性降级规则；任务失败不会阻塞登录、作业提交或已发布成绩查询。
