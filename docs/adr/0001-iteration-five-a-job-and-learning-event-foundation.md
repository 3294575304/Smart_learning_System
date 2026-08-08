# ADR 0001：迭代五 A 后台任务与学习事件基础层

- 状态：已采纳
- 日期：2026-08-08
- 范围：迭代五 A；不包含 Python 题型、编辑器、测试用例评分或画像界面

## 背景与决策

仓库中的大纲解析、知识图谱生成和通知任务各自拥有局部状态，但它们的执行、失败恢复和幂等语义不同。迭代五 A 不改造这些已验收链路，也不将 `NotificationJobRun` 扩展为通用工作流。新增最小 `BackgroundJob` / `BackgroundJobAttempt`，仅作为后续远程判题和画像计算共用的持久化任务契约。

批改产生的课程 Concept 证据已有追加修订和掌握度投影。新增 `LearningEvent` / `LearningEventConcept` 作为不可变事实层，并让新发生的自动、人工批改和撤销在同一数据库事务中完成：

> 学习事件 → `StudentAnswerConceptEvidence` 投影 → 掌握度修订

旧证据不回填。`KnowledgeGraphConcept` 继续作为跨正式图谱版本的稳定身份；`LearningEventConcept` 同时引用作业发布时冻结的 `AssignmentQuestionConceptSnapshot`，不以 `PublishedKnowledgeGraphNode` 代替稳定 Concept。

## 后台任务状态机

允许的状态变化：

```text
PENDING -> RUNNING -> SUCCEEDED
                   -> FAILED
                   -> CANCELLED
FAILED(可重试且未耗尽) -> PENDING
RUNNING(租约过期) -> FAILED -> PENDING 或 FAILED
```

实现可以在一个恢复事务中完成“记录本次失败并重新置为 PENDING”，但 `BackgroundJobAttempt` 必须永久保留 `errorCode=BACKGROUND_JOB_LEASE_EXPIRED`，因此不会丢失中间失败事实。

规则：

1. `(type, idempotencyKey)` 唯一。相同语义输入返回原任务；同键但请求人、课程、最大次数或输入不同返回 409。
2. Claim 使用包含 `status`、当前 `attemptCount` 和空租约的数据库条件更新。只有更新一行的 worker 可以创建 Attempt。
3. Claim、心跳、完成、失败和过期恢复使用 Serializable 事务；序列化冲突只在有限次数内重试。
4. 心跳、完成和失败必须同时匹配 `jobId`、`leaseId`、RUNNING 状态和未过期 Attempt。过期或被取消的 worker 不能写终态。
5. 租约恢复重新检查数据库中的实时过期时间，不能根据扫描阶段的陈旧结果夺走已续租任务。
6. 取消是协作式的：数据库立即进入 CANCELLED 并使租约失效；worker 通过心跳失败停止工作，远程执行器负责实际终止沙箱进程。
7. 外部执行允许至少一次；任务完成及其业务投影通过 `completeBackgroundJob(..., projectResult)` 在一个事务中提交。

## 错误码与重试

| 错误码                                      | 含义                     | 默认重试             |
| ------------------------------------------- | ------------------------ | -------------------- |
| `BACKGROUND_JOB_INPUT_CONFLICT`             | 幂等键对应不同输入       | 否，HTTP 409         |
| `BACKGROUND_JOB_LEASE_LOST`                 | 租约过期、取消或已被替换 | 否，HTTP 409         |
| `BACKGROUND_JOB_LEASE_EXPIRED`              | 恢复器关闭过期 Attempt   | 是，未耗尽时指数退避 |
| `BACKGROUND_JOB_CANCELLED`                  | 请求方取消               | 否                   |
| `BACKGROUND_JOB_INTERNAL_ERROR`             | 未分类内部错误           | 由调用方显式决定     |
| `EXECUTOR_UNAVAILABLE` / `EXECUTOR_TIMEOUT` | 远程执行器不可用         | 是                   |
| `SANDBOX_SECURITY_CAPABILITY_FAILED`        | 安全能力探测失败         | 否；阻断五 B         |

退避从 1 秒开始按 Attempt 指数增长，上限 5 分钟。`maxAttempts` 限制为 1–10。错误内容只保存稳定错误码，不保存学生源代码、隐藏用例、环境变量或底层堆栈。

## 学习事件幂等与重放

- `(sourceType, sourceId, sourceRevision)` 唯一；当前来源为 `STUDENT_ANSWER`。
- `sourceRevision` 与 `StudentAnswer.conceptEvidenceRevision` 一致。相同评分指纹直接复用，不增加事件、证据或掌握度修订。
- 事件载荷在写入前通过严格 Zod Schema；只包含答案 ID、证据状态、评分来源、分值、评分时间和 Concept 快照数量，不包含姓名、学号、邮箱或作答内容。
- 重新评分或撤销生成新事件，并以 `supersedesEventId` 指向上一事件；旧事件和旧证据不覆盖。
- 投影规则版本为 `assessment-projection-v1`，事件 Schema 为 `assessment-event-v1`。相同事件集合与掌握度规则版本产生相同输入指纹，重放复用已有修订。

## 沙箱边界

Next.js 进程只实现远程 `SandboxExecutor` 接口，不调用本机 Python、容器命令或子进程。内部与学生 DTO 分离；学生 DTO 丢弃所有 `visibility=HIDDEN` 的用例结果并限制输出长度。

`npm run test:sandbox-capabilities` 必须连接真实远程执行器，实际提交禁网、CPU、墙钟、内存、宿主文件、进程、输出和宿主秘密探测。没有配置执行器或任一探测失败时命令失败，迭代五 B 不得开始。

## 数据迁移与回滚

迁移 `20260808120000_add_background_job_foundation` 只增加任务模型；后续迁移 `20260808123000_add_learning_events` 增加事件模型及可空的 `StudentAnswerConceptEvidence.learningEventId`。两者均不更新已有行。

应用回退时先停止新 worker 和新学习事件写入，旧应用可忽略新增表和可空列。数据库回滚只允许在确认没有下游引用后执行；首选保留新增表。若必须物理回滚，应先导出新增事件和任务 Attempt，再按外键逆序删除 `LearningEventConcept`、证据上的可空外键、`LearningEvent`、`BackgroundJobAttempt`、`BackgroundJob` 和新增枚举。任何回滚都不得删除或改写原有答题证据及掌握度修订。

## 已知边界

- 本 ADR 不迁移大纲、图谱、导入或通知任务。
- 本阶段没有可供学生调用的代码运行接口。
- 真实沙箱能力验证依赖外部隔离执行器；未取得通过报告前，五 A 只能标记为“实现中”，不能通过退出门禁。
