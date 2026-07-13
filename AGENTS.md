# AGENTS.md

## Project Identity

项目名称：

AI Smart Learning Platform

项目目标：

开发一个智能教学平台，连接管理员、教师和学生三类用户。

核心业务闭环：

教师创建班级和题目
->
教师发布作业
->
学生完成答题
->
系统自动批改
->
生成成绩统计
->
AI分析学生学习情况
->
推荐个性化练习
->
持续优化学生知识掌握情况

---

# Development Philosophy

你是一名资深全栈工程师。

开发过程中遵循：

1. 优先保证功能正确，再优化代码。
2. 优先完成 MVP，不提前开发复杂功能。
3. 不允许为了方便而破坏已有架构。
4. 每次只修改当前任务相关内容。
5. 所有功能必须考虑：
   - 权限
   - 数据安全
   - 异常处理
   - 可测试性
   - 后续扩展

---

# Technology Stack

Frontend:

- Next.js
- TypeScript
- React
- Tailwind CSS
- shadcn/ui

Backend:

- Next.js Server Actions / API Routes
- Prisma ORM
- PostgreSQL

Validation:

- Zod

Authentication:

- Role Based Access Control

AI:

统一 AI Service Layer

禁止业务代码直接调用 AI API。

---

# User Roles

系统包含三个角色。

## ADMIN

管理员。

权限：

- 管理用户
- 管理教师
- 管理学生
- 管理公共题库
- 管理系统配置
- 查看平台数据

## TEACHER

教师。

权限：

- 创建班级
- 管理班级学生
- 创建题目
- 管理题库
- 发布作业
- 查看学生成绩
- 查看班级学习分析

## STUDENT

学生。

权限：

- 加入班级
- 查看作业
- 完成答题
- 查看成绩
- 查看错题
- 获取AI学习建议
- 完成个性化推荐练习

---

# Architecture Rules

## Database

所有数据库修改必须：

1. 修改 Prisma Schema
2. 创建 migration
3. 更新 seed 数据
4. 检查是否影响已有数据

禁止：

- 直接修改生产数据库
- 删除已有字段但没有迁移方案

所有核心表必须包含：

```ts
createdAt;
updatedAt;
```

ID 使用：

```
cuid()
```

或者：

```
uuid
```

---

# Database Design Principles

数据必须满足：

## 用户隔离

教师只能访问自己的：

- 班级
- 学生
- 题目
- 成绩

学生只能访问：

- 自己加入的班级
- 自己的数据

禁止：

通过修改 URL 或 API 参数访问其他用户数据。

---

# API Rules

所有 API 必须：

1. 验证身份。

2. 验证角色。

3. 验证资源归属。

4. 使用 Zod 校验输入。

接口返回统一格式：

成功：

```json
{
  "success": true,
  "data": {}
}
```

失败：

```json
{
  "success": false,
  "error": "message"
}
```

禁止：

直接返回数据库错误。

---

# Frontend Rules

所有页面必须包含：

- loading 状态
- empty 状态
- error 状态

表单必须：

- React Hook Form
- Zod Schema

删除操作：

必须二次确认。

复杂组件：

拆分到：

```
components/
```

业务逻辑：

放：

```
services/
```

不要把大量业务逻辑写在页面组件中。

---

# AI Integration Rules

AI不是核心业务逻辑。

AI负责：

- 学情分析
- 答题解释
- 学习建议
- 推荐理由

普通程序负责：

- 分数计算
- 正确率统计
- 权限判断
- 数据过滤

---

# AI Service Architecture

禁止：

```ts
openai.chat();
```

直接写在业务代码。

必须：

```
services/
   ai/
      provider.ts
      analyzer.ts
      recommender.ts
```

统一接口：

```ts
interface AIProvider {
  analyzeStudentPerformance();

  explainQuestion();

  recommendLearning();
}
```

---

# AI Output Rules

所有 AI 返回必须：

1. JSON格式

2. Zod验证

3. 失败重试一次

如果失败：

必须降级：

使用普通统计规则。

AI失败不能导致：

- 无法提交作业
- 无法查看成绩
- 系统崩溃

---

# Question System Rules

题目必须包含：

- title
- content
- type
- difficulty
- answer
- explanation
- knowledgePoints

支持：

- 单选
- 多选
- 判断
- 填空
- 简答

---

# Testing Rules

每完成一个功能必须测试：

正常流程：

例如：

教师创建题目。

异常流程：

例如：

学生访问教师接口。

必须测试：

- 未登录
- 权限不足
- 参数错误
- 数据不存在
- 重复提交
- AI异常

---

# Git Rules

Git 是必须流程。

每完成一个独立功能：

执行：

```
git status
```

检查修改。

执行：

```
git diff
```

确认没有无关修改。

然后：

```
git add .
```

commit格式：

新增：

```
feat:
```

修复：

```
fix:
```

重构：

```
refactor:
```

测试：

```
test:
```

示例：

```
feat: add teacher question management
```

禁止：

提交：

```
.env
node_modules
.next
```

禁止：

直接提交 main。

默认：

开发分支：

```
dev
```

完成功能后：

询问：

"代码已经commit，是否push到GitHub？"

---

# Development Workflow

每个任务必须按照：

## Step 1

理解需求。

## Step 2

检查已有代码。

## Step 3

提出方案：

包括：

- 修改文件
- 数据变化
- API变化
- 风险

## Step 4

等待确认。

## Step 5

编码。

## Step 6

测试。

## Step 7

Git commit。

---

# Coding Style

TypeScript：

禁止：

```ts
any;
```

必须：

明确类型。

函数：

保持单一职责。

变量：

使用有意义名称。

禁止：

大量复制代码。

---

# Current MVP Priority

开发顺序：

1. 项目初始化
2. 用户认证
3. RBAC权限
4. 班级管理
5. 题库管理
6. 作业发布
7. 学生答题
8. 自动批改
9. 成绩统计
10. AI学情分析
11. 个性化推荐

不要提前开发：

- 视频课堂
- 家长端
- 支付
- 社交功能
- 复杂知识图谱

---

# Communication Style

当收到开发任务：

不要立即写代码。

必须先回复：

1. 我理解的需求
2. 实现方案
3. 修改文件
4. 数据变化
5. 风险

确认后再编码。
