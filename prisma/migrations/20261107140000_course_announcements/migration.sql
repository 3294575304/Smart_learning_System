-- 教师端「课程通知」：为 Announcement 增加班级维度与撤回状态。
-- 全部为可空列 + 索引 + 枚举值，历史记录 classroomId 保持 NULL（即角色级系统公告），不需要回填。
--
-- 注意：classroomId 同时承担「作用域」语义（NULL = 系统级广播），
-- 因此外键必须 ON DELETE CASCADE；若改为 SET NULL，班级被删除后
-- 一条班级通知会静默变成「发给全站学生」的系统公告。

ALTER TYPE "AnnouncementTargetType" ADD VALUE IF NOT EXISTS 'CLASSROOM';
ALTER TYPE "AnnouncementStatus" ADD VALUE IF NOT EXISTS 'REVOKED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COURSE_ANNOUNCEMENT';

ALTER TABLE "Announcement"
  ADD COLUMN "classroomId" TEXT,
  ADD COLUMN "revokedById" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "Announcement_classroomId_status_createdAt_idx"
  ON "Announcement"("classroomId", "status", "createdAt");

CREATE INDEX "Announcement_classroomId_publishedAt_idx"
  ON "Announcement"("classroomId", "publishedAt");

ALTER TABLE "Announcement"
  ADD CONSTRAINT "Announcement_classroomId_fkey"
  FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Announcement"
  ADD CONSTRAINT "Announcement_revokedById_fkey"
  FOREIGN KEY ("revokedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
