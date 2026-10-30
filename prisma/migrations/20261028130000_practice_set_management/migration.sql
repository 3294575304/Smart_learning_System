-- Independent lifecycle metadata; no score/evidence backfill or destructive changes.
CREATE TABLE "PracticeSetManagement" (
 "id" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "cycleKey" TEXT NOT NULL,
 "title" VARCHAR(80),
 "endedAt" TIMESTAMP(3),
 "trashedAt" TIMESTAMP(3),
 "revision" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "PracticeSetManagement_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "PracticeSetManagement_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PracticeSetManagement_revision_check" CHECK ("revision" >= 0),
 CONSTRAINT "PracticeSetManagement_trash_ended_check" CHECK ("trashedAt" IS NULL OR "endedAt" IS NOT NULL)
);
CREATE UNIQUE INDEX "PracticeSetManagement_studentId_cycleKey_key" ON "PracticeSetManagement"("studentId","cycleKey");
CREATE INDEX "PracticeSetManagement_studentId_trashedAt_endedAt_idx" ON "PracticeSetManagement"("studentId","trashedAt","endedAt");
-- Rollback retains the table and metadata. The previous application does not enforce these lifecycle controls.
