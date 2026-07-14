# AI Smart Learning Platform 数据库设计

本文档对应 [`prisma/schema.prisma`](../prisma/schema.prisma) 和迁移
`prisma/migrations/20260714043000_add_learning_domain_models/migration.sql`。

## 1. 设计原则

- PostgreSQL 为唯一事实来源，Prisma 负责类型安全的数据访问。
- 所有表使用 `String @id @default(cuid())`，并包含 `createdAt`、`updatedAt`。
- 教师资源显式保存 `teacherId` 或 `creatorId`，学生数据显式保存 `studentId`，API 查询必须同时校验角色和资源归属。
- 分数、权重和掌握度使用定点 `Decimal`，避免浮点误差。
- 已发布作业保存题目、选项、标准答案、解析和知识点快照，题库后续修改不影响历史作答。
- AI 结果拆为可查询字段和明细表；JSON 只保存输入指标、扩展配置及原始响应审计副本。
- 有教学历史的数据优先关闭、停用、归档或撤回，不物理删除。

## 2. 实体关系

### 2.1 用户与班级

- `User` 与 `UserProfile` 是一对一关系。
- 教师 `User` 与 `Classroom` 是一对多关系。
- 学生与班级通过 `ClassMembership` 建立多对多关系。
- `ClassMembership(classroomId, studentId)` 唯一；学生主动退出后可复用原记录重新激活，教师移除后禁止自行重新加入。

### 2.2 题库与知识点

- 创建者 `User` 与 `Question`、`KnowledgePoint` 均为一对多关系。
- `Question` 与 `QuestionOption` 是一对多关系。
- `Question` 与 `KnowledgePoint` 通过 `QuestionKnowledgePoint` 建立多对多关系，并通过 `weight` 表示知识点在该题中的统计权重。
- `KnowledgePoint.parentId` 支持轻量级父子层次，但不提前实现复杂知识图谱。

### 2.3 作业、提交与批改

- `Classroom`、教师 `User` 分别与 `Assignment` 是一对多关系。
- `AssignmentQuestion` 是作业内题目及其发布快照；`AssignmentQuestionOption` 和 `AssignmentQuestionKnowledgePoint` 保存选项与知识点快照。
- `Submission` 表示学生的一次作业尝试，`StudentAnswer` 表示逐题答案。
- 多选答案通过 `StudentAnswerOption` 关联作业选项快照，保证引用完整性。
- `WrongQuestion` 与产生错误的 `StudentAnswer` 一对一，避免同一次错误重复进入错题本。

### 2.4 学情、推荐与 AI

- `StudentKnowledgeMastery` 按“学生 + 知识点”保存当前可复算的掌握状态。
- `AIAnalysis` 保存一次学生或班级分析；`AIAnalysisInsight` 保存可筛选的优势、薄弱点、风险和建议。
- `PersonalizedRecommendation` 关联学生、题目、目标知识点和可选分析来源。
- `AITutoringRecord` 保存问题、回答、步骤、提示、调用状态、模型指标和降级信息。

## 3. 字段字典

### 3.1 通用字段

以下字段存在于所有模型，后续表格不重复列出：

| 字段        | 用途                                      |
| ----------- | ----------------------------------------- |
| `id`        | cuid 主键；API 和关联关系使用的稳定标识。 |
| `createdAt` | 记录首次创建时间，用于审计和时间排序。    |
| `updatedAt` | Prisma 自动维护的最后更新时间。           |

### 3.2 User / UserProfile

| 模型          | 字段           | 用途                                      |
| ------------- | -------------- | ----------------------------------------- |
| `User`        | `email`        | 登录邮箱，全局唯一。                      |
|               | `passwordHash` | bcrypt 密码散列，禁止通过 API 返回。      |
|               | `role`         | `ADMIN`、`TEACHER`、`STUDENT` RBAC 角色。 |
|               | `status`       | 账号启用或停用状态。                      |
|               | `lastLoginAt`  | 最近一次成功登录时间。                    |
| `UserProfile` | `userId`       | 一对一关联账号，唯一。                    |
|               | `displayName`  | 页面显示姓名。                            |
|               | `avatarUrl`    | 可选头像地址。                            |
|               | `bio`          | 可选个人简介。                            |
|               | `phone`        | 可选联系电话。                            |
|               | `studentNo`    | 学号；为空时不参与唯一约束。              |
|               | `teacherNo`    | 教师编号；为空时不参与唯一约束。          |

### 3.3 Classroom / ClassMembership

| 模型              | 字段                | 用途                             |
| ----------------- | ------------------- | -------------------------------- |
| `Classroom`       | `teacherId`         | 班级所有者，接口必须校验该字段。 |
|                   | `name`              | 班级名称。                       |
|                   | `description`       | 班级说明。                       |
|                   | `joinCode`          | 全局唯一加班码。                 |
|                   | `joinCodeExpiresAt` | 加班码可选失效时间。             |
|                   | `allowStudentLeave` | 是否允许学生主动退出。           |
|                   | `status`            | 活跃、关闭或归档。               |
|                   | `closedAt`          | 班级关闭时间。                   |
| `ClassMembership` | `classroomId`       | 所属班级。                       |
|                   | `studentId`         | 加入班级的学生。                 |
|                   | `status`            | 有效、主动退出或教师移除。       |
|                   | `joinedAt`          | 首次或最近一次有效加入时间。     |
|                   | `endedAt`           | 成员关系结束时间；有效时为空。   |

### 3.4 KnowledgePoint / Question

| 模型                     | 字段                | 用途                                                  |
| ------------------------ | ------------------- | ----------------------------------------------------- |
| `KnowledgePoint`         | `createdById`       | 创建该知识点的管理员或教师。                          |
|                          | `parentId`          | 可选父知识点。                                        |
|                          | `code`              | 稳定业务编码，全局唯一。                              |
|                          | `name`              | 知识点名称。                                          |
|                          | `description`       | 知识点说明。                                          |
|                          | `isActive`          | 是否允许用于新题目。                                  |
| `Question`               | `creatorId`         | 题目所有者；公共题通常由管理员创建。                  |
|                          | `title`             | 题目短标题。                                          |
|                          | `content`           | 完整题干。                                            |
|                          | `type`              | 单选、多选、判断、填空或简答。                        |
|                          | `difficulty`        | 1 到 5 的整数难度。                                   |
|                          | `visibility`        | 私有题或公共题。                                      |
|                          | `status`            | 草稿、启用、停用或归档。                              |
|                          | `explanation`       | 成绩发布后可展示的解析。                              |
|                          | `tags`              | 轻量标签数组，用于题库整理。                          |
|                          | `correctBoolean`    | 判断题标准答案。                                      |
|                          | `referenceAnswer`   | 简答题参考答案。                                      |
|                          | `acceptableAnswers` | 填空题可接受答案数组。                                |
|                          | `isCaseSensitive`   | 文本自动批改是否区分大小写。                          |
|                          | `gradingConfig`     | 题型相关少量扩展配置，例如数值容差；必须经 Zod 校验。 |
|                          | `deletedAt`         | 有引用题目的软删除时间；普通查询默认排除。            |
| `QuestionOption`         | `questionId`        | 所属单选或多选题。                                    |
|                          | `label`             | 选项标签，例如 A、B。                                 |
|                          | `content`           | 选项内容。                                            |
|                          | `isCorrect`         | 是否为正确选项。                                      |
|                          | `sortOrder`         | 选项稳定展示顺序。                                    |
| `QuestionKnowledgePoint` | `questionId`        | 关联题目。                                            |
|                          | `knowledgePointId`  | 关联知识点。                                          |
|                          | `weight`            | 该知识点在题目统计中的正权重。                        |

### 3.5 Assignment 及快照

| 模型                               | 字段                        | 用途                                            |
| ---------------------------------- | --------------------------- | ----------------------------------------------- |
| `Assignment`                       | `classroomId`               | 发布目标班级。                                  |
|                                    | `teacherId`                 | 作业所有者；必须与班级教师一致。                |
|                                    | `title`                     | 作业标题。                                      |
|                                    | `description`               | 作业说明。                                      |
|                                    | `status`                    | 草稿、已发布、已关闭或已归档。                  |
|                                    | `totalPoints`               | 作业总分。                                      |
|                                    | `publishedAt`               | 发布时间。                                      |
|                                    | `dueAt`                     | 可选截止时间。                                  |
|                                    | `closedAt`                  | 实际关闭时间。                                  |
| `AssignmentQuestion`               | `assignmentId`              | 所属作业。                                      |
|                                    | `questionId`                | 原题引用，用于追踪来源。                        |
|                                    | `sortOrder`                 | 作业内题序。                                    |
|                                    | `points`                    | 本作业中的题目分值。                            |
|                                    | `titleSnapshot`             | 发布时标题快照。                                |
|                                    | `contentSnapshot`           | 发布时题干快照。                                |
|                                    | `typeSnapshot`              | 发布时题型。                                    |
|                                    | `difficultySnapshot`        | 发布时难度。                                    |
|                                    | `explanationSnapshot`       | 发布时解析。                                    |
|                                    | `correctBooleanSnapshot`    | 判断题答案快照。                                |
|                                    | `referenceAnswerSnapshot`   | 简答题参考答案快照。                            |
|                                    | `acceptableAnswersSnapshot` | 填空题答案快照。                                |
|                                    | `isCaseSensitiveSnapshot`   | 文本匹配规则快照。                              |
|                                    | `gradingConfigSnapshot`     | 批改扩展配置快照。                              |
| `AssignmentQuestionOption`         | `assignmentQuestionId`      | 所属作业题。                                    |
|                                    | `sourceOptionId`            | 原选项 ID，仅用于追踪，不设外键以允许题库维护。 |
|                                    | `labelSnapshot`             | 选项标签快照。                                  |
|                                    | `contentSnapshot`           | 选项内容快照。                                  |
|                                    | `isCorrectSnapshot`         | 正确性快照。                                    |
|                                    | `sortOrder`                 | 选项顺序快照。                                  |
| `AssignmentQuestionKnowledgePoint` | `assignmentQuestionId`      | 所属作业题。                                    |
|                                    | `knowledgePointId`          | 原知识点引用。                                  |
|                                    | `codeSnapshot`              | 知识点编码快照。                                |
|                                    | `nameSnapshot`              | 知识点名称快照。                                |
|                                    | `weightSnapshot`            | 统计权重快照。                                  |

### 3.6 Submission / StudentAnswer / WrongQuestion

| 模型                  | 字段                         | 用途                                             |
| --------------------- | ---------------------------- | ------------------------------------------------ |
| `Submission`          | `assignmentId`               | 所属作业。                                       |
|                       | `studentId`                  | 提交学生。                                       |
|                       | `attemptNumber`              | 尝试序号；撤回重做时递增。                       |
|                       | `idempotencyKey`             | 客户端提交幂等键，全局唯一。                     |
|                       | `status`                     | 草稿、已交、待人工批改、已批改、已发布或已撤回。 |
|                       | `startedAt`                  | 开始作答时间。                                   |
|                       | `submittedAt`                | 确认交卷时间。                                   |
|                       | `gradedAt`                   | 全部批改完成时间。                               |
|                       | `publishedAt`                | 成绩对学生可见时间。                             |
|                       | `withdrawnAt`                | 异常提交撤回时间。                               |
|                       | `score`                      | 当前总得分。                                     |
|                       | `maxScore`                   | 批改时总满分。                                   |
|                       | `percentage`                 | 百分制成绩，范围 0–100。                         |
|                       | `feedback`                   | 作业级教师评语。                                 |
| `StudentAnswer`       | `submissionId`               | 所属提交。                                       |
|                       | `assignmentQuestionId`       | 回答的作业题快照。                               |
|                       | `graderId`                   | 可选人工批改教师。                               |
|                       | `textAnswer`                 | 填空或简答文本答案。                             |
|                       | `booleanAnswer`              | 判断题答案。                                     |
|                       | `gradingStatus`              | 未批改、自动批改、待人工批改或已批改。           |
|                       | `score`                      | 逐题得分。                                       |
|                       | `maxScore`                   | 逐题满分快照。                                   |
|                       | `isCorrect`                  | 是否满分正确；简答部分得分时可为 `false`。       |
|                       | `teacherFeedback`            | 逐题教师评语。                                   |
|                       | `gradedAt`                   | 逐题批改时间。                                   |
| `StudentAnswerOption` | `studentAnswerId`            | 所属学生答案。                                   |
|                       | `assignmentQuestionOptionId` | 被选择的选项快照。                               |
| `WrongQuestion`       | `studentId`                  | 错题所属学生。                                   |
|                       | `studentAnswerId`            | 产生错题的唯一答题记录。                         |
|                       | `assignmentQuestionId`       | 对应作业题快照。                                 |
|                       | `isResolved`                 | 是否已通过复习解决。                             |
|                       | `reviewCount`                | 复习次数。                                       |
|                       | `firstWrongAt`               | 首次记录错误时间。                               |
|                       | `lastReviewedAt`             | 最近复习时间。                                   |
|                       | `resolvedAt`                 | 标记解决时间。                                   |

### 3.7 StudentKnowledgeMastery

| 字段               | 用途                         |
| ------------------ | ---------------------------- |
| `studentId`        | 学生。                       |
| `knowledgePointId` | 知识点。                     |
| `level`            | 离散掌握等级。               |
| `trend`            | 上升、稳定、下降或未知趋势。 |
| `masteryScore`     | 0–100 掌握分。               |
| `earnedPoints`     | 该知识点累计加权得分。       |
| `availablePoints`  | 该知识点累计加权满分。       |
| `answeredCount`    | 参与统计的答题数。           |
| `correctCount`     | 满分正确数。                 |
| `calculatedAt`     | 最近计算时间。               |
| `sourceStartedAt`  | 当前统计窗口开始时间。       |
| `sourceEndedAt`    | 当前统计窗口结束时间。       |

### 3.8 AIAnalysis / AIAnalysisInsight

| 模型                | 字段                         | 用途                                             |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| `AIAnalysis`        | `requestKey`                 | 分析请求幂等键。                                 |
|                     | `requestedById`              | 发起分析的用户。                                 |
|                     | `studentId`                  | 学生分析目标；班级分析时为空。                   |
|                     | `classroomId`                | 班级分析目标；学生分析时为空。                   |
|                     | `scope`                      | 学生或班级分析。                                 |
|                     | `status`                     | 处理中、成功、失败或规则降级。                   |
|                     | `riskLevel`                  | 可筛选风险等级。                                 |
|                     | `summary`                    | 简短分析摘要。                                   |
|                     | `overallScore`               | 可选综合分，0–100。                              |
|                     | `sampleSize`                 | 分析涉及的有效样本数。                           |
|                     | `basedOnFrom` / `basedOnTo`  | 数据统计时间范围。                               |
|                     | `provider` / `model`         | 实际 AI 供应商和模型。                           |
|                     | `promptVersion`              | 提示词及输出 Schema 版本。                       |
|                     | `retryCount`                 | 重试次数，只允许 0 或 1。                        |
|                     | `fallbackUsed`               | 是否使用普通统计规则降级。                       |
|                     | `inputMetrics`               | 发送给分析器的去敏统计指标快照。                 |
|                     | `rawResponse`                | 通过验证后的原始 JSON 审计副本，不承担主要查询。 |
|                     | `errorCode`                  | 稳定内部错误码，不存数据库或供应商堆栈。         |
|                     | `completedAt`                | 完成或降级结束时间。                             |
| `AIAnalysisInsight` | `analysisId`                 | 所属分析。                                       |
|                     | `knowledgePointId`           | 可选关联知识点。                                 |
|                     | `type`                       | 优势、薄弱点、风险或建议。                       |
|                     | `title`                      | 可展示标题。                                     |
|                     | `detail`                     | 详细说明。                                       |
|                     | `priority`                   | 排序优先级，数值越大越优先。                     |
|                     | `metricName` / `metricValue` | 支撑结论的可查询指标。                           |
|                     | `recommendedAction`          | 可执行建议。                                     |

### 3.9 PersonalizedRecommendation / AITutoringRecord

| 模型                         | 字段                                        | 用途                                 |
| ---------------------------- | ------------------------------------------- | ------------------------------------ |
| `PersonalizedRecommendation` | `studentId`                                 | 推荐目标学生。                       |
|                              | `questionId`                                | 推荐题目。                           |
|                              | `knowledgePointId`                          | 目标薄弱知识点。                     |
|                              | `analysisId`                                | 可选来源分析。                       |
|                              | `cycleKey`                                  | 推荐周期或批次键。                   |
|                              | `source`                                    | 规则、AI 或混合生成。                |
|                              | `status`                                    | 待完成、进行中、完成、忽略或过期。   |
|                              | `reason`                                    | 结构化筛选后的推荐理由。             |
|                              | `targetDifficulty`                          | 推荐时目标难度。                     |
|                              | `priority`                                  | 展示优先级。                         |
|                              | `expiresAt`                                 | 推荐过期时间。                       |
|                              | `startedAt` / `completedAt` / `dismissedAt` | 推荐状态时间。                       |
|                              | `wasCorrect`                                | 推荐练习完成后是否正确。             |
|                              | `score` / `maxScore`                        | 推荐练习结果。                       |
| `AITutoringRecord`           | `requestKey`                                | 答疑请求幂等键。                     |
|                              | `studentId`                                 | 提问学生。                           |
|                              | `questionId`                                | 提问所围绕的题目。                   |
|                              | `knowledgePointId`                          | 可选主要知识点。                     |
|                              | `status`                                    | 处理中、成功、失败或降级。           |
|                              | `prompt`                                    | 学生问题。                           |
|                              | `answer`                                    | 经过校验或降级生成的答复。           |
|                              | `explanationSteps`                          | 可查询的分步解释数组。               |
|                              | `hints`                                     | 可查询的提示数组。                   |
|                              | `provider` / `model`                        | 实际供应商和模型。                   |
|                              | `promptVersion`                             | 提示词及输出 Schema 版本。           |
|                              | `retryCount`                                | 重试次数，只允许 0 或 1。            |
|                              | `fallbackUsed`                              | 是否使用题库解析降级。               |
|                              | `confidence`                                | 可选 0–1 置信度。                    |
|                              | `safetyFlagged`                             | 输出是否触发安全标记。               |
|                              | `inputContext`                              | 发送给 AI 的最小去敏上下文审计副本。 |
|                              | `rawResponse`                               | 已验证 JSON 原始响应审计副本。       |
|                              | `errorCode`                                 | 稳定内部错误码。                     |
|                              | `promptTokens` / `completionTokens`         | 成本与用量统计。                     |
|                              | `latencyMs`                                 | 调用耗时。                           |
|                              | `completedAt`                               | 完成时间。                           |

## 4. 唯一约束和索引

### 4.1 主要唯一约束

| 约束                                                               | 目的                                     |
| ------------------------------------------------------------------ | ---------------------------------------- |
| `User.email`                                                       | 防止重复账号。                           |
| `UserProfile.userId/studentNo/teacherNo`                           | 一人一资料，并防止学号、教师号重复。     |
| `Classroom.joinCode`                                               | 防止加班码冲突。                         |
| `ClassMembership(classroomId, studentId)`                          | 防止重复加入班级。                       |
| `KnowledgePoint.code`                                              | 提供稳定知识点业务键。                   |
| `QuestionOption(questionId, label/sortOrder)`                      | 防止同题选项标签或顺序重复。             |
| `QuestionKnowledgePoint(questionId, knowledgePointId)`             | 防止知识点重复绑定。                     |
| `AssignmentQuestion(assignmentId, questionId/sortOrder)`           | 防止同题重复入作业及题序冲突。           |
| 快照表的父记录与标签、顺序或知识点组合                             | 防止重复快照。                           |
| `Submission.idempotencyKey`                                        | 防止网络重试产生重复交卷。               |
| `Submission(assignmentId, studentId, attemptNumber)`               | 防止同一尝试重复创建。                   |
| `StudentAnswer(submissionId, assignmentQuestionId)`                | 每次提交每题只有一个答案。               |
| `StudentAnswerOption(studentAnswerId, assignmentQuestionOptionId)` | 防止重复选择同一选项。                   |
| `WrongQuestion.studentAnswerId`                                    | 同一次错误只进入错题本一次。             |
| `StudentKnowledgeMastery(studentId, knowledgePointId)`             | 每个学生每个知识点只有一份当前掌握状态。 |
| `AIAnalysis.requestKey` / `AITutoringRecord.requestKey`            | AI 请求幂等。                            |
| `PersonalizedRecommendation(studentId, questionId, cycleKey)`      | 同一推荐周期不重复推荐同一题。           |

### 4.2 PostgreSQL 部分唯一索引

Prisma 6 无法在 Schema 中声明以下索引，因此直接写入 migration：

```sql
CREATE UNIQUE INDEX "Submission_one_current_per_assignment_student_key"
ON "Submission"("assignmentId", "studentId")
WHERE "status" <> 'WITHDRAWN';

CREATE UNIQUE INDEX "PersonalizedRecommendation_one_active_question_per_student_key"
ON "PersonalizedRecommendation"("studentId", "questionId")
WHERE "status" IN ('PENDING', 'STARTED');
```

第一条允许保留多条已撤回历史，但同一学生、同一作业只能有一个当前尝试。第二条允许未来重新推荐已完成或已过期题目，但不能同时产生两条活动推荐。

### 4.3 查询索引

- 用户：角色与状态、创建时间。
- 班级：教师与状态、状态与创建时间。
- 成员：学生/班级与成员状态。
- 题库：创建者、可见性、状态、题型和难度组合。
- 作业：班级/教师、状态、截止时间和创建时间。
- 提交：作业或学生、状态、提交时间。
- 批改：作业题与批改状态、批改教师与时间。
- 错题：学生、是否解决、首次出错时间。
- 掌握度：学生与等级/分数、知识点与分数。
- AI：分析目标、状态、风险、创建时间；答疑学生、题目、状态和知识点。
- 推荐：学生、状态、优先级、知识点和分析来源。

## 5. 数据库级完整性检查

迁移额外加入以下 `CHECK`：

- 活跃题目的答案字段必须与题型匹配；作业题快照也执行相同检查。
- 知识点权重和作业题分值必须为正数，总分不得为负。
- 提交、逐题答案、推荐结果满足 `0 <= score <= maxScore`，百分比为 0–100。
- 提交时间必须满足开始、交卷、批改、发布的先后顺序。
- 掌握度、计数和累计分值不得越界。
- AI 学生分析只能有 `studentId`，班级分析只能有 `classroomId`。
- AI 失败只允许重试一次，置信度、Token 和耗时不得越界。

以下跨行或跨表规则由 Zod、事务和服务层保证：

- 用户角色必须匹配教师、学生外键用途。
- `Assignment.teacherId` 必须等于班级所有者。
- 学生提交时必须是当前有效班级成员。
- 单选题必须恰好一个正确选项，多选题至少两个选项且至少一个正确选项。
- 作业 `totalPoints` 必须等于作业题分值合计。
- `StudentAnswer.assignmentQuestionId` 必须属于 `Submission.assignmentId`。

## 6. 删除策略

| 数据                         | 策略                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 用户                         | 使用 `User.status=INACTIVE`；存在业务数据时外键 `RESTRICT` 禁止物理删除。                                                |
| 用户资料                     | 仅在账号确实被删除时 `CASCADE`。                                                                                         |
| 班级                         | 使用 `CLOSED/ARCHIVED`；成员、作业和 AI 历史均 `RESTRICT`。                                                              |
| 班级成员                     | 使用 `LEFT/REMOVED` 和 `endedAt`；保留提交审计。                                                                         |
| 题目、知识点                 | 使用停用/归档；已被作业或统计引用时 `RESTRICT`。                                                                         |
| 未发布题目的选项和题目知识点 | 随题目 `CASCADE`，便于编辑草稿。                                                                                         |
| 作业                         | 发布后不物理删除；仅草稿可删除，其题目快照 `CASCADE`。                                                                   |
| 作业题选项、知识点快照       | 随未发布作业题 `CASCADE`；学生答案引用后由 `RESTRICT` 保护。                                                             |
| 提交、学生答案、错题、掌握度 | 历史数据全部 `RESTRICT`，异常交卷使用 `WITHDRAWN`。                                                                      |
| AI 分析                      | 分析主体受 `RESTRICT` 保护；删除分析时洞察 `CASCADE`，推荐的 `analysisId` 置空。生产环境建议按留存策略归档而非直接删除。 |
| 推荐、答疑                   | 保留学习和 AI 审计历史，主体外键 `RESTRICT`。                                                                            |

## 7. 防重复策略

### 7.1 重复加入班级

数据库唯一约束保证并发请求最多创建一条成员记录。主动退出的 `LEFT` 成员可使用有效邀请码重新激活；教师移除的 `REMOVED` 成员不能自行重新加入。

### 7.2 重复提交

1. 客户端为一次交卷生成稳定 `idempotencyKey`。
2. 服务层事务锁定当前 `Submission` 并只允许从 `IN_PROGRESS` 转为已提交状态。
3. 唯一幂等键防止相同请求重复执行。
4. 部分唯一索引防止并发创建多个非撤回尝试。
5. 教师撤回异常提交后，旧记录变为 `WITHDRAWN`，新记录使用递增 `attemptNumber`。

### 7.3 重复推荐

1. `cycleKey` 使用稳定业务周期，例如周、分析 ID 或推荐批次 ID。
2. 三字段唯一约束防止同一周期重复写入。
3. 部分唯一索引防止同一题同时存在两条待完成/进行中推荐。
4. 新周期可重新推荐已完成、已忽略或已过期题目；候选过滤服务仍应排除近期已完成题。

## 8. 数据迁移步骤

1. 备份数据库并确认当前 migration 全部成功。
2. 在维护前执行只读检查：重复邮箱、现有用户数量、空姓名、迁移状态。
3. 部署新代码前运行 `npm run prisma:generate`。
4. 执行 `npm exec prisma migrate deploy`：
   - 将 `User.password` 原地重命名为 `passwordHash`，不重算散列；
   - 创建新枚举和业务表；
   - 从 `User.name` 回填一对一 `UserProfile`；
   - 回填完成后删除旧 `User.name`；
   - 创建外键、索引、部分唯一索引和 `CHECK`。
5. 验证每个现有用户均有且只有一个资料记录，密码散列值未变化。
6. 在开发或验收环境运行 `npm run prisma:seed`；生产环境禁止运行演示 Seed。
7. 运行登录、权限、题目发布、并发提交、批改、错题、AI 降级和推荐去重测试。
8. 监控约束冲突和慢查询；若失败，停止新版本流量并从备份恢复。不要手工删除 migration 已记录的数据。

## 9. Seed 测试数据方案

Seed 可重复执行，主要记录使用自然唯一键或业务组合键 `upsert`：

- 1 名管理员、2 名教师、3 名学生。
- 1 个正常班级、1 个教师隔离测试班；2 名学生入班，1 名学生未入班。
- 3 个知识点和单选、多选、判断、填空、简答五类题目。
- 公共题、教师私有题和另一教师私有题，用于题库权限测试。
- 1 份已发布作业及完整题目、选项、答案、解析、知识点快照。
- 1 份已发布成绩提交，包含自动批改和人工批改答案。
- 1 条错题、2 条知识点掌握状态。
- 1 条成功学生分析及结构化洞察、1 条班级规则降级分析。
- 1 条待完成推荐、1 条已完成推荐。
- 1 条成功 AI 答疑、1 条输出异常后的降级答疑。

验收测试还应在独立测试事务中补充：未登录、错误角色、跨教师访问、未入班提交、非法题型字段、并发重复交卷、同周期重复推荐和 AI 连续失败。
