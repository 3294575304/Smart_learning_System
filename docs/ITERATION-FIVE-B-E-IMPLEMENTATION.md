# 迭代五 B–E 实现与验收状态

> 日期：2026-08-10
> 范围：五 B0、五 B1、五 B2、五 B3、五 C、五 D、五 E
> 结论：B0–B3、C、D 的代码纵切已实现，外部 AI 真实契约探测通过；远程 gVisor 安全能力复测 8/8 和 Python 判题真实纵向集成均已通过，E 的本地与测试数据库门禁通过。本机 Next.js、PostgreSQL、登录态常驻 worker 和 SSH 隧道已部署；浏览器人工演示及无人登录开机自启尚未完成，迭代五整体暂不标记完成。

## 实现状态

| 阶段  | 状态     | 已实现                                                                                                                                 |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 五 B0 | 已实现   | 独立 Python 判题 worker、数据库任务租约、重试/恢复、执行器健康、密钥轮换窗口、队列背压、短任务不可测资源返回 `null`                    |
| 五 B1 | 已实现   | `PYTHON_PROGRAMMING`、不可变配置修订、公开/隐藏用例、资源限制、发布时冻结配置/用例哈希/执行器规则版本、隐藏数据 DTO 隔离               |
| 五 B2 | 已实现   | 公开运行与正式判题分离、隐藏用例异步执行、确定性评分、系统故障可重试、输入指纹、追加式重判/撤销、学习事件/Concept 证据/掌握度事务闭环  |
| 五 B3 | 已实现   | 教师配置与用例管理、学生代码编辑/公开运行/取消/进度/结果、教师重判与撤销、安全错误摘要和完整状态界面                                   |
| 五 C  | 已实现   | 不可变画像快照、输入指纹、规则版本、事件水位、图谱/掌握度修订引用、三档证据状态、置信度、分维度数据、师生页面和证据下钻                |
| 五 D  | 已实现   | 外部 AI 候选、严格输出校验与输入 ID 白名单、失败安全降级、教师批量预览/修改/确认、来源版本元数据、不覆盖人工绑定、未确认候选隔离       |
| 五 E  | 部分通过 | 空库 migration、seed、HTTP/数据库集成、格式、lint、类型、全量测试、worker/执行器/Next.js 构建、真实沙箱 8 项探测和远程判题纵向集成通过 |

## 关键不变量

- Next.js 请求不直接执行学生代码；只有独立 worker 调用隔离执行器。
- 公开样例运行不计分，也不生成正式学习事件、Concept 证据或掌握度修订。
- 正式判题的隐藏输入、期望输出和用例可见性不进入学生 DTO；正式用例 stdout/stderr 不持久化。
- `SYSTEM_ERROR` 不按学生零分处理；任务保持可重试，租约完成投影保证重试不重复写成绩、事件、证据或掌握度。
- 发布后的编程题配置、测试用例和作业快照不可改写；重判和撤销都追加新 Attempt/事件修订。
- 画像只对达到证据门槛的 Concept 输出稳定结论；无活跃度或反思采集源时明确保存“无证据”，不以成绩代替。
- AI/规则候选与正式题目图谱绑定分表保存；教师确认前不会进入作业快照、画像或推荐，确认时跳过已有人工绑定。

## 已通过门禁

- `prisma format`
- `prisma validate`
- `prisma generate`
- `npm run format:check`
- `npm run lint`（零警告）
- `npm run typecheck`
- `npm test`
- `npm run build:sandbox-executor`
- `npm run build:programming-judge-worker`
- `npm run build`
- `npm run test:http-integration`
  - 在独立测试 schema 从空库顺序应用 43 个 migration
  - seed 成功
  - 认证、角色、所有权、作业、后台任务、学习事件/掌握度、推荐、通知、错题等 HTTP 集成通过
  - 2026-08-10 复跑时顺序应用 44 个 migration，并新增通过“Next.js 生产服务 → 独立判题 worker → 受控执行器替身”的 Python 判题纵向用例
  - 该用例覆盖教师配置权限、作业配置冻结、学生公开运行、正式隐藏判题、隐藏字段不泄露、确定性计分、学习事件和课程 Concept 证据投影
- `npm run test:integration`
  - 在第二个独立测试 schema 再次从空库应用 43 个 migration
  - 推荐与通知 PostgreSQL 集成 14/14 通过
- `npm run test:sandbox-capabilities`
  - 通过 SSH 隧道连接 `8.133.167.139` 上仅监听回环地址的 gVisor 执行器
  - 禁网、CPU、墙钟、内存、宿主文件、进程、输出和宿主秘密 8/8 通过
  - 脱敏报告：`docs/evidence/iteration-five-a-sandbox-capabilities-2026-08-10.json`
- `npm run test:programming-runtime`
  - 在独立测试 schema 应用 44 个 migration 并完成 seed
  - 实际链路为 Next.js 生产服务 → 独立判题 worker → SSH 隧道 → 远程 gVisor 执行器
  - 公开样例 stdin、隐藏判题、确定性成绩、隐藏字段隔离、学习事件和课程 Concept 证据投影通过
  - 脱敏报告：`docs/evidence/iteration-five-b-real-runtime-2026-08-10.json`
- `git diff --check`
- 外部 AI 真实契约探测
  - 仅发送合成题干与合成 Concept 元数据，不发送学生数据、答案或测试用例
  - OpenAI-compatible / `deepseek-chat` 请求成功
  - 严格 JSON、候选上限和 question/Concept 输入 ID 范围校验通过
  - 脱敏报告：`docs/evidence/iteration-five-d-ai-question-mapping-2026-08-09.json`

## 尚未关闭的门禁

1. 本机已使用当前 Windows 用户登录计划任务运行 Next.js、SSH 隧道和判题 worker；重新登录可自动恢复，但无人登录时的开机自启尚未配置。若后续部署正式服务器，仍需改为专用服务账户或 Windows/Linux 服务。
2. 尚未进行浏览器人工演示：教师建题/发布、学生公开运行/正式提交、判题完成、证据与画像下钻的完整交互链。

远程执行器继续只监听 `127.0.0.1:8788`，没有开放裸 HTTP 公网端口。本机应用只监听 `127.0.0.1:3000`，运行时密钥保存在 Git 忽略且限制 ACL 的 `.data/local-deployment`。Linux 正式服务器仍可使用 `deploy/programming-judge-worker/install-worker-service.sh` 和加固 systemd 单元部署。

只有上述生产拓扑和人工演示门禁关闭后，才能把“迭代五整体”标记为完成并进入课程图谱驱动推荐。
