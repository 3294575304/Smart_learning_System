# 个性化推荐 PostgreSQL 集成测试

## 隔离方案

集成测试只读取 `TEST_DATABASE_URL`，不会回退到 `DATABASE_URL`。运行器要求数据库名包含 `test`，并拒绝与 `DATABASE_URL` 指向同一数据库。

每次运行都会在测试数据库中创建名称为 `recommendation_it_*` 的随机 schema，在其中执行已有 migration。每个测试使用唯一数据前缀并在结束时按外键依赖顺序清理；整套测试结束后删除随机 schema。

没有采用外层事务回滚，是因为生产推荐服务会自行开启 Serializable 事务，外层 Prisma 事务无法覆盖服务使用的独立 Client 和真实并发请求。

## 创建测试数据库

使用有创建数据库权限的 PostgreSQL 账号执行：

```bash
createdb -U postgres smart_learning_test
```

也可以使用：

```bash
psql -U postgres -d postgres -c "CREATE DATABASE smart_learning_test"
```

测试库必须与开发库、预发布库和生产库完全分离。

## 环境变量

在本地 `.env` 中添加测试专用连接，不要提交真实密码：

```dotenv
TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/smart_learning_test?schema=public"
```

保留正常的 `DATABASE_URL` 指向开发数据库。两者不能指向同一个数据库。

## 初始化与运行

无需手动初始化表结构。测试运行器会对随机 schema 执行：

```bash
prisma migrate deploy
```

常用命令：

```bash
npm test
npm run test:integration
npm run test:all
```

`npm test` 只运行单元测试，不要求 PostgreSQL。显式执行集成测试但缺少 `TEST_DATABASE_URL` 时会立即给出错误。

## 数据清理

正常结束或测试失败时，运行器都会删除本次随机 schema。每个测试也会清理自己创建的数据，因此测试不依赖固定主键、seed 数据或执行顺序。

如果进程被强制终止，可能残留 `recommendation_it_*` schema。确认当前连接确实是测试数据库后，可先查询：

```sql
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name LIKE 'recommendation_it_%';
```

只删除已经人工确认的具体测试 schema，不要使用模糊匹配执行删除。

## 常见错误

- `TEST_DATABASE_URL is required`：配置测试数据库连接后重试。
- 数据库名必须包含 `test`：创建明确命名的专用测试数据库，不要绕过安全校验。
- `must not point to the same database`：开发库和测试库配置重复。
- migration 权限错误：为测试账号授予在测试数据库中创建和删除 schema 的权限。
- 连接失败：确认 PostgreSQL 已启动、端口正确且防火墙允许本机或 CI 连接。
- Next.js 测试服务启动失败：检查端口占用和测试输出中的编译错误。

## 安全警告

禁止把 `TEST_DATABASE_URL` 配置为生产、预发布或共享开发数据库。测试会创建并删除 PostgreSQL schema；数据库名检查只是最后一道保护，不能替代正确的环境隔离和最小权限账号。
