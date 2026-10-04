ALTER TABLE "Question" ADD COLUMN "isAssignmentOnly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Assignment" ADD COLUMN "submissionTask" JSONB;
ALTER TABLE "Assignment" ADD COLUMN "allowAttachments" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "AuditAction" ADD VALUE 'SUBMISSION_ATTACHMENT_UPLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBMISSION_ATTACHMENT_DOWNLOADED';
ALTER TYPE "AuditAction" ADD VALUE 'SUBMISSION_ATTACHMENT_DELETED';
CREATE TABLE "SubmissionAttachment" (
 "id" TEXT NOT NULL PRIMARY KEY, "submissionId" TEXT NOT NULL, "assignmentQuestionId" TEXT NOT NULL,
 "originalName" VARCHAR(200) NOT NULL, "mimeType" VARCHAR(100) NOT NULL, "sizeBytes" INTEGER NOT NULL,
 "storageKey" TEXT NOT NULL, "sha256" CHAR(64) NOT NULL, "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SubmissionAttachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "SubmissionAttachment_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SubmissionAttachment_storageKey_key" ON "SubmissionAttachment"("storageKey");
CREATE INDEX "SubmissionAttachment_submissionId_assignmentQuestionId_deletedAt_idx" ON "SubmissionAttachment"("submissionId","assignmentQuestionId","deletedAt");
