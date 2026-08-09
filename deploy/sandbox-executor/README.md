# 沙箱执行器部署

本目录保存 V1.0 迭代五 A 独立 Python 沙箱执行器的可审查部署资产。Next.js 进程只调用远程 HTTP 契约，不在应用进程或普通本机子进程中执行学生代码。

## 已验证基线

- Ubuntu 22.04 x86_64 云虚机，2 vCPU、约 2 GB 内存。
- Docker 29.1.3。
- gVisor `runsc release-20260803.0`，虚机使用 `systrap`。
- Node.js 20.19.5 控制服务。
- Ubuntu 22.04 最小根文件系统和 Python 3.10.4。
- 执行器最大并发 1，API 仅监听 `127.0.0.1:8788`。

## 资产

- `install-node20.sh`：下载 Node.js 20 归档并使用发布方 `SHASUMS256.txt` 校验。
- `build-python-rootfs.sh`：使用签名 Ubuntu 软件源构建最小 Python 根文件系统并导入 Docker。
- `python-runtime.Dockerfile`：Docker Registry 可达环境的等价镜像定义。
- `install-executor-service.sh`：创建专用账户、安装编译产物、生成或保留 API 密钥并启用 systemd 服务。
- `zhixue-sandbox-executor.service`：限制文件系统、设备、capabilities、任务数和服务内存的 systemd 单元。

执行器 TypeScript 源码位于 `services/sandbox-executor-server`，使用以下命令构建到 Git 忽略的 `.data/sandbox-executor-build`：

```bash
npm run build:sandbox-executor
```

## 网络与密钥

服务默认不直接开放公网。验收通过 SSH 隧道连接：

```text
127.0.0.1:18788 -> SSH -> executor 127.0.0.1:8788
```

应用有两种受支持的连接方式：本地开发/运维验收使用 SSH 隧道把本机回环端口转发到执行器 `127.0.0.1:8788`；云端生产优先使用同区域私网 HTTP，否则使用有来源限制的 TLS 入口。禁止把裸 HTTP 执行器暴露到公网。

`SANDBOX_EXECUTOR_API_KEY` 至少 32 字符，只能保存在服务端秘密配置中，不得写入浏览器代码、Git、日志或验收报告。轮换时先在执行器设置新 `SANDBOX_EXECUTOR_API_KEY` 和旧 `SANDBOX_EXECUTOR_PREVIOUS_API_KEY`，再切换应用/worker，确认旧实例退出后删除 previous 值。

`SANDBOX_EXECUTOR_MAX_QUEUE_DEPTH` 默认 100。达到上限时新请求返回 `429 EXECUTOR_QUEUE_FULL` 与 `Retry-After`，相同 `requestId` 的幂等请求仍可复用。健康检查需要 Bearer 密钥：

```bash
curl -fsS -H "Authorization: Bearer $SANDBOX_EXECUTOR_API_KEY" http://127.0.0.1:8788/health
```

## 验收与限制

运行：

```bash
npm run test:sandbox-capabilities
```

缺少真实执行器配置或任一探测失败时命令必须失败。2026-08-09 的脱敏报告位于 `docs/evidence/iteration-five-a-sandbox-capabilities-2026-08-09.json`。

短任务如果未采到可靠的 Docker/gVisor CPU、峰值内存或进程样本，对应字段返回 `null`，禁止用 `0` 冒充实测值；墙钟耗时和输出字节仍按执行器观测返回。题型、隐藏用例评分与成绩投影由应用和独立 worker 负责。
