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

## 多语言扩展（2026-11-16，待目标环境验收）

代码支持 Python 3、C17（GCC 11）、C++17（G++ 11）、Java 17 和 JavaScript（Node.js 22）。Python 继续使用原镜像；在执行器主机准备其余镜像：

```bash
docker build -f deploy/sandbox-executor/cpp-runtime.Dockerfile -t zhixue-cpp-sandbox:11-v1 .
docker build -f deploy/sandbox-executor/java-runtime.Dockerfile -t zhixue-java-sandbox:17-v1 .
docker build -f deploy/sandbox-executor/javascript-runtime.Dockerfile -t zhixue-javascript-sandbox:22-v1 .
```

部署更新后的执行器、判题 worker 和 Web，并先应用 `20261116090000_programming_languages`。镜像构建需要软件源或容器仓库网络；学生代码运行仍禁用网络。可选的执行器端环境变量为 `SANDBOX_C_RUNTIME_IMAGE`、`SANDBOX_CPP_RUNTIME_IMAGE`、`SANDBOX_JAVA_RUNTIME_IMAGE`、`SANDBOX_JAVASCRIPT_RUNTIME_IMAGE`；默认分别使用上面标签。`SANDBOX_RUNTIME_IMAGE` 继续只控制 Python。

C/C++/Java 在同一 gVisor 隔离容器内完成编译和运行；仅 `/build` 增加大小为 64 MiB 的可执行临时文件系统，源码只读、根文件系统只读、非 root、禁网和资源限制继续生效，退出后销毁。不在 Web 或 worker 主机编译学生代码。Java 主类必须为 `Main`，JavaScript 使用 Node.js 标准输入接口。

非 Python 请求的编译及虚拟机启动额度取题目原限制与 CPU 5000ms、墙钟 10000ms、内存 256MiB、进程 32 的较大值；仍受契约的 30s CPU、60s 墙钟、512MiB 内存、64 进程上限约束，输出限制不变。每个测试点重新启动容器，显示墙钟耗时（包含启动、编译与采样），峰值内存未采到时显示 `—`。这些指标不等同于 OJ 的纯程序耗时。

“运行测试”和正式提交都执行该配置的全部用例；前者不计课程分数、不写正式掌握度证据。学生只看到一个公开样例，运行结果只对首个公开样例返回输出，其余测试点只返回状态、分值和经过校验的资源统计。新建配置默认一个公开样例和五个隐藏用例，教师需填写题目对应的数据；保存新修订时其余公开用例转为隐藏。已有发布快照不回写。

迁移只追加语言字段，旧题目配置、旧作答和旧 Attempt 默认为 Python，不修改源码、测试数据或成绩。回滚应用前应停止新多语言任务并保留新增字段和历史记录；不要删除字段、重算历史成绩或把新语言源码回退为 Python。旧执行器无法接收新语言，需和 worker 配套升级。目标主机镜像构建、五语言真实运行、禁网/超时/内存/编译错误及恢复演练仍需单独验收，原 Python 安全验收不能替代这些检查。
