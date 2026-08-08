# V1.0 迭代五 A 阶段验收记录

> 日期：2026-08-08
>
> 范围：判题与画像共用的数据基础层
>
> 结论：A1–A4 与 A5 的数据库/HTTP 回归已完成；真实沙箱能力门禁未通过，迭代五 A 仍为“实现中”，不得进入五 B

## 已交付

### A1：契约与 ADR

- ADR 明确任务状态机、租约、至少一次执行、幂等冲突、重试错误码、取消语义、事件重放、隐私边界和回滚策略。
- 通用任务不复用 `NotificationJobRun`，也不改造大纲、图谱和导入任务。

### A2：后台任务基础

- `BackgroundJob` 保存当前状态、输入指纹、进度、重试计划、当前租约和终态。
- `BackgroundJobAttempt` 保存每次执行的 worker、执行器版本、心跳、过期时间、错误码和脱敏资源摘要。
- Claim 使用数据库条件更新和 Serializable 事务；并发 12 个 worker 只有 1 个成功。
- 心跳、完成、失败和过期恢复同时验证任务与租约；恢复器会重新检查实时过期时间，续租后的 Attempt 不会被陈旧扫描夺走。
- 旧 worker、已取消任务和终态任务不能写回。任务完成与业务投影支持同事务提交。

### A3：统一学习事件

- `LearningEvent` 是追加式、版本化、去标识化事件；`LearningEventConcept` 同时引用稳定 `KnowledgeGraphConcept` 和冻结的 `AssignmentQuestionConceptSnapshot`。
- 自动评分、人工评分、重评与撤销统一进入 `appendAssessmentLearningEventAndProjectEvidence()`。
- 学习事件、`StudentAnswerConceptEvidence` 和掌握度修订处于原批改事务中；任一步失败整体回滚。
- 同输入指纹重放不增加事件、证据或掌握度修订；撤销生成 `ASSESSMENT_REVOKED` 并通过 `supersedesEventId` 保留历史。
- `synchronizeAnswerConceptEvidence()` 仅保留为兼容适配器。不上线前历史回填。

### A4：远程执行器与内部接口

- 定义远程 `SandboxExecutor` 的提交、查询和取消接口，Next.js 进程没有本地代码执行实现。
- `/api/internal/background-jobs/*` 使用独立的至少 32 字符 Bearer 密钥；错误响应不返回内部堆栈。
- 执行结果使用严格 Zod DTO，资源字段标准化；隐藏用例的 stdout/stderr 在内部落库前清空，学生 DTO 完全丢弃隐藏用例并限制输出长度。

### A5：自动化验证

- 安全探测脚本会向真实远程执行器提交禁网、CPU、墙钟、内存、宿主文件、进程、输出和宿主秘密探测，不接受应用进程本地执行。
- 当前机器没有 Docker，且未配置 `SANDBOX_EXECUTOR_URL` / `SANDBOX_EXECUTOR_API_KEY`；`npm run test:sandbox-capabilities` 实际失败并返回 `Sandbox executor is not configured`。
- 因此安全能力仍是明确阻断项，不能用 Mock 或接口声明替代验收。

## 数据库迁移

- `20260808120000_add_background_job_foundation`：任务与 Attempt。
- `20260808123000_add_learning_events`：事件、Concept 引用和证据的可空事件外键。
- 两个 migration 均为纯追加，不包含 `INSERT` 或历史 `UPDATE`；现有证据不回填。
- 应用回退可停止新 worker/事件写入并保留新增表。物理回滚前必须导出新数据，并禁止删除或改写原有证据与掌握度修订。

## 验收结果

| 门禁                         | 结果     | 证据                                                    |
| ---------------------------- | -------- | ------------------------------------------------------- |
| 并发 Claim 唯一              | 通过     | 隔离 PostgreSQL 中 12 worker 并发仅 1 成功              |
| 任务幂等与输入冲突           | 通过     | 同输入复用；不同输入抛 409 契约错误                     |
| 租约过期恢复与旧 worker 拒绝 | 通过     | Attempt 记录过期失败，新租约接管，旧租约完成失败        |
| 投影事务回滚                 | 通过     | 任务投影、学习事件/证据/掌握度强制异常后均无部分写入    |
| 事件/证据/掌握度重放幂等     | 通过     | 相同答案状态重放计数不变                                |
| 撤销保留事件历史             | 通过     | 新撤销事件指向上一事件，旧事件不覆盖                    |
| 内部 worker 密钥             | 通过     | 缺失/错误密钥 401，正确密钥可访问                       |
| 原权限与跨课程回归           | 通过     | HTTP 集成套件覆盖未登录、角色不符、资源归属和跨课程隔离 |
| 隐藏用例不进入学生 DTO       | 通过     | 单元测试验证隐藏 ID/输出均不出现，内部隐藏输出清空      |
| 真实沙箱限制                 | **阻断** | 当前无真实执行器，安全探测命令失败                      |

## 范围边界

本阶段没有新增 Python 题型、代码编辑器、公开样例运行、隐藏用例评分、画像快照、AI 批量匹配或历史回填。只有在真实隔离执行器的全部探测通过并保存验收报告后，才能把迭代五 A 标记为完成并开始五 B。
