# 智学课堂

AI 驱动的智能教学平台。当前 MVP 已完成管理员治理、教师教学、学生作答、自动与人工批改、成绩发布、学情分析、个性化推荐练习和错题复习的核心业务闭环。

完整功能状态、角色权限、环境配置、测试数据库、演示流程和已知限制见 [`docs/MVP-ACCEPTANCE.md`](docs/MVP-ACCEPTANCE.md)。

V1.0“迭代一：课程模型与导入基础”采用“预导入身份、学生自主认领”的账号流程。名单导入只创建待认领身份和班级预分配；学生在注册页使用唯一学号与名单姓名认领账号。历史一次性账号仅保留兼容能力，当前验收记录见 [`docs/ITERATION-ONE-ACCEPTANCE.md`](docs/ITERATION-ONE-ACCEPTANCE.md)。

## AI 学情分析

- `POST /api/student/submissions/:submissionId/analysis` 为当前已批改作答生成或复用学情分析。
- `GET /api/student/submissions/:submissionId/analysis` 读取与当前数据指纹匹配的已有分析。
- 本地默认使用 `MockAIProvider`；真实环境可将 `AI_PROVIDER` 配置为 `openai-compatible`，并设置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`AI_TIMEOUT_MS` 和 `AI_PSEUDONYM_SALT`。
- 模型输出会经过严格 Zod 校验，失败最多重试一次；仍失败时返回基于正确率的规则结果。分析接口独立于交卷和成绩接口，AI 故障不会影响成绩查看。

## 教学大纲结构化解析

- `POST /api/teacher/courses/:courseId/syllabus/parse` 解析教师课程当前版本的文本型教学大纲 PDF；`GET` 查询当前草稿和历史版本。
- 解析结果只保存为草稿，不会自动发布知识点或覆盖正式课程结构。
- PDF 按页提取文本，不支持扫描件 OCR；加密、损坏、无文本和超限文件会返回可理解的业务错误。
- AI 输出经过严格 Zod 校验，失败最多重试一次。相同教学大纲版本和解析器版本会复用成功结果，并阻止并发重复解析。

## 管理员系统配置

- 管理员可在 `/admin/system-config` 管理平台名称、公告、维护模式、自主注册、作业默认值和 AI 增强分析开关。
- 配置写入与审计日志处于同一数据库事务；没有配置记录时使用服务端注册表中的安全默认值。
- 维护模式会阻止教师和学生的受保护页面及业务 API，管理员仍可进入后台关闭维护模式。
- 数据库连接、Session/Token 密钥、AI API Key、Provider、模型和服务地址仍由环境变量管理，不会通过配置 API 返回或修改。

## 站内通知与系统公告

- 登录用户可在 `/notifications` 查看自己的真实业务通知、筛选未读状态并批量标记已读；导航栏展示真实未读数量。
- 当前支持作业发布、截止前 24 小时提醒、自动批改完成、学情分析完成、推荐周期更新和管理员系统公告。
- 管理员在 `/admin/announcements` 创建草稿并显式发布公告。公告发布、批量通知和审计日志处于同一事务，重复发布不会重复通知。
- 截止提醒由 `POST /api/internal/jobs/assignment-reminders` 执行，必须使用 `Authorization: Bearer <NOTIFICATION_JOB_SECRET>`。仓库没有内置调度器，生产环境需要由部署平台每小时调用一次。
- 当前仅支持站内通知，不支持邮件、短信、微信、手机推送、WebSocket 或 SSE。
- 完整触发规则、去重和部署说明见 [`docs/notifications.md`](docs/notifications.md)。

## 技术栈

- Next.js（App Router）
- React 与 TypeScript
- Tailwind CSS
- shadcn/ui 基础配置
- Next.js Server Actions / API Routes
- Prisma ORM
- PostgreSQL
- Zod
- ESLint 与 Prettier

## 环境要求

- Node.js 20.9 或更高版本
- npm 10 或更高版本
- PostgreSQL 14 或更高版本

## 启动方式

1. 安装依赖：

   ```bash
   npm install
   ```

2. 复制环境变量模板：

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell 可使用：

   ```powershell
   Copy-Item .env.example .env
   ```

3. 修改 `.env` 中的 `DATABASE_URL`，指向本地 PostgreSQL 数据库。

4. 初始化数据库并导入基础账号：

   ```bash
   npm run db:setup
   ```

5. 启动开发服务器：

   ```bash
   npm run dev
   ```

6. 浏览器访问 `http://localhost:3000`。

## 登录与权限

- 管理员、教师和学生登录后分别进入 `/admin`、`/teacher`、`/student`。
- `/register` 只允许已由教师或管理员预导入名单的学生按唯一学号和名单姓名认领账号；客户端不能指定角色，并受管理员自主注册开关控制。
- 名单导入不会为新学生创建默认密码账号，而是保存待认领身份和班级预分配关系；认领成功后自动建立正式班级成员关系。
- 会话令牌保存在 `HttpOnly` Cookie 中，数据库只保存令牌摘要。
- 页面入口由中间件做粗粒度保护，角色与资源归属始终在服务端再次校验。
- 未登录 API 返回 `401`，角色不符返回 `403`，跨教师资源使用 `404` 防止枚举。

开发环境测试账号：

| 角色   | 邮箱                  | 默认密码      |
| ------ | --------------------- | ------------- |
| 管理员 | `admin@example.com`   | `Admin123!`   |
| 教师   | `teacher@example.com` | `Teacher123!` |
| 学生   | `student@example.com` | `Student123!` |

这些默认密码仅供本地开发，部署前必须通过 `SEED_*` 环境变量修改。

## 数据库初始化

生成 Prisma Client：

```bash
npm run prisma:generate
```

创建并应用开发迁移：

```bash
npm run prisma:migrate
```

导入管理员、教师和学生基础账号：

```bash
npm run prisma:seed
```

seed 账号由 `.env` 中的 `SEED_*` 环境变量控制。模板中的密码仅供本地开发，禁止用于生产环境。

## 质量检查

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:http-integration
npm run build
npx prisma validate
npx prisma migrate status
```

HTTP 集成测试要求配置独立的 `TEST_DATABASE_URL`，数据库名必须包含 `test` 标记且不能与 `DATABASE_URL` 相同。测试会在该数据库内创建并清理隔离 Schema，不会修改开发库；运行前需要先执行一次 `npm run build`。
