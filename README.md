# 智学课堂

AI 驱动的智能教学平台。平台面向管理员、教师和学生，已提供账号密码认证、数据库会话、角色路由保护和资源归属校验基础，后续将继续实现题库、作业、成绩分析、AI 答疑和个性化练习推荐等能力。

## AI 学情分析

- `POST /api/student/submissions/:submissionId/analysis` 为当前已批改作答生成或复用学情分析。
- `GET /api/student/submissions/:submissionId/analysis` 读取与当前数据指纹匹配的已有分析。
- 本地默认使用 `MockAIProvider`；真实环境可将 `AI_PROVIDER` 配置为 `openai-compatible`，并设置 `AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`AI_TIMEOUT_MS` 和 `AI_PSEUDONYM_SALT`。
- 模型输出会经过严格 Zod 校验，失败最多重试一次；仍失败时返回基于正确率的规则结果。分析接口独立于交卷和成绩接口，AI 故障不会影响成绩查看。

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
- `/register` 只创建学生账号，客户端不能指定角色，并受管理员自主注册开关控制。
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
npm test
npm run test:integration
npm run build
```

HTTP 集成测试要求本地 PostgreSQL 已完成迁移和 seed，并且已经执行一次 `npm run build`。
