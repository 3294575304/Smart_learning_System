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
