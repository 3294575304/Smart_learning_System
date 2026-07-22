# 站内通知中心与作业提醒

## 支持的通知类型

| 类型                      | 真实触发条件                                     | 去重键                                 |
| ------------------------- | ------------------------------------------------ | -------------------------------------- |
| `ASSIGNMENT_PUBLISHED`    | 教师首次把草稿作业发布成功                       | `assignment-published:{assignmentId}`  |
| `ASSIGNMENT_DUE_SOON`     | 受保护任务扫描到未来 24 小时内截止且学生仍未提交 | `assignment-due-24h:{assignmentId}`    |
| `ASSIGNMENT_GRADED`       | 学生提交后，全部题目自动批改并进入 `GRADED`      | `assignment-graded:{submissionId}`     |
| `LEARNING_ANALYSIS_READY` | 可用学情分析及洞察成功持久化                     | `learning-analysis-ready:{analysisId}` |
| `RECOMMENDATION_READY`    | 新推荐周期实际新增至少一条推荐记录               | `recommendation-ready:{cycleKey}`      |
| `SYSTEM_ANNOUNCEMENT`     | 管理员显式发布公告草稿                           | `system-announcement:{announcementId}` |

去重键与 `recipientId` 组成数据库复合唯一约束。业务重试、并发发布和定时任务重复运行都不会为同一接收人重复创建相同事件通知。

## 权限与数据安全

- 普通通知 API 不接受 `userId`，始终以当前数据库会话用户为查询和更新范围。
- 禁用用户的会话会被清理，无法访问通知 API。
- 他人的通知 ID 与不存在的通知 ID 统一返回 404。
- 公告管理 API 仅允许管理员访问。
- 通知类型由服务端业务事件决定，不提供前端创建通知接口。
- `actionUrl` 必须是以单个 `/` 开头的站内路径，拒绝外部 URL、反斜线和控制字符。
- 公告按纯文本存储和渲染，不使用 `dangerouslySetInnerHTML`；脚本标签只会显示为文本。
- 通知 DTO 不返回去重键、来源字段或内部 metadata。

## 事务与失败策略

- 作业发布：作业状态更新和学生通知处于同一事务。
- 公告发布：公告状态、角色通知和管理员审计处于同一事务。
- 自动批改、学情分析和推荐：核心结果先提交，随后创建通知。通知失败不会回滚核心业务，只记录不含异常堆栈和个人信息的结构化错误。
- AI Provider 失败但规则降级分析成功时，发送“学情分析已生成”，不会声称远端 AI 调用成功。

## 截止提醒调度

仓库当前没有 Cron、队列或常驻后台任务。系统提供：

```text
POST /api/internal/jobs/assignment-reminders
Authorization: Bearer <NOTIFICATION_JOB_SECRET>
```

`NOTIFICATION_JOB_SECRET` 必须是至少 32 个字符的服务端环境变量。管理员登录身份不能代替任务密钥。

任务每次最多扫描 100 个已发布作业，只处理：

- 发布时间不晚于当前时间；
- 未来 24 小时内截止；
- 班级仍有效；
- 成员关系有效且学生账号启用；
- 学生没有 `SUBMITTED`、`PENDING_REVIEW`、`GRADED` 或 `PUBLISHED` 提交。

建议生产环境由部署平台每小时调用一次。重复调用由数据库唯一约束保证安全。任务返回 `runId`、扫描数量、创建数量、跳过数量和失败数量，并在 `NotificationJobRun` 中保留轻量运行结果。

本地手动触发示例：

```powershell
$headers = @{ Authorization = "Bearer $env:NOTIFICATION_JOB_SECRET" }
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/internal/jobs/assignment-reminders" -Headers $headers
```

不得把真实任务密钥写入仓库、文档、浏览器环境变量或请求日志。

## 过期与历史通知

- 截止提醒在作业截止时过期。
- 系统公告通知沿用公告的 `expiresAt`。
- 推荐通知沿用推荐周期过期时间。
- 作业发布、成绩和学情分析通知长期保留。
- 过期通知默认不在列表中显示，也不计入未读数量。
- 当前不自动物理删除通知；历史数据通过分页读取。

## 当前不支持

- 逐次学生提交通知；教师页面已有提交数量统计。
- 人工批改提醒；项目尚无真实人工批改服务入口。
- 系统异常群发；项目尚无可靠后台异常检测来源。
- 邮件、短信、微信、手机推送、WebSocket 和 SSE。
