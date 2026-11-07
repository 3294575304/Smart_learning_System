-- 多班级批次标识：同一次「保存草稿 / 发布」生成的每班作业共享同一个 batchId。
-- 仅新增可空列与索引，历史数据保持 batchId = NULL，不影响任何既有查询。
ALTER TABLE "Assignment" ADD COLUMN "batchId" TEXT;

CREATE INDEX "Assignment_batchId_status_idx" ON "Assignment"("batchId", "status");
