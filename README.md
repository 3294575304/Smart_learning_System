# 智学课堂

AI 驱动的智能教学平台。平台面向管理员、教师和学生，已提供账号密码认证、数据库会话、角色路由保护和资源归属校验基础，后续将继续实现题库、作业、成绩分析、AI 答疑和个性化练习推荐等能力。

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
- `/register` 只创建学生账号，客户端不能指定角色。
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
