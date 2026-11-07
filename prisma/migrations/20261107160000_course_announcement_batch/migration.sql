-- 课程通知支持「一次多选多个班级」：同一批多班发布共享一个 batchId。
-- 仅新增可空列与索引，历史记录 batchId 保持 NULL，不影响任何既有查询。

ALTER TABLE "Announcement" ADD COLUMN "batchId" TEXT;

CREATE INDEX "Announcement_batchId_idx" ON "Announcement"("batchId");
