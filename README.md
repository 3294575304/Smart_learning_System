# 智学课堂

AI 驱动的智能教学平台基础工程。平台面向管理员、教师和学生，后续将逐步实现班级、题库、作业、成绩分析、AI 答疑和个性化练习推荐等能力。

当前仓库只包含第一阶段基础架构，不包含登录、权限或教学业务功能。

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
npm run build
```
