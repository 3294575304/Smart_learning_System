-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'EXAM_DRAFT_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXAM_DRAFT_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'EXAM_DRAFT_REVIEWED';

-- AlterEnum
ALTER TYPE "AuditTargetType" ADD VALUE 'EXAM_DRAFT';

-- CreateTable
CREATE TABLE "ExamPaperDraft" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "questionCategoryId" TEXT NOT NULL,
    "jobId" TEXT,
    "publishedExamId" TEXT,
    "sourceFileName" VARCHAR(255) NOT NULL,
    "sourceFormat" VARCHAR(20) NOT NULL,
    "sourceChecksum" CHAR(64) NOT NULL,
    "sourceStorageKey" VARCHAR(191) NOT NULL,
    "sourceText" TEXT NOT NULL DEFAULT '',
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "errorCode" VARCHAR(100),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "type" "ExamType" NOT NULL DEFAULT 'MIDTERM',
    "title" VARCHAR(120) NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "allowedSwitches" INTEGER NOT NULL DEFAULT 2,
    "classroomIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" VARCHAR(100),
    "model" VARCHAR(191),
    "promptVersion" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaperDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPaperDraftQuestion" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "sourceLocator" VARCHAR(200) NOT NULL DEFAULT '',
    "questionJson" JSONB NOT NULL,
    "points" DECIMAL(8,2) NOT NULL DEFAULT 10,
    "pointsInferred" BOOLEAN NOT NULL DEFAULT false,
    "answerSource" VARCHAR(20) NOT NULL DEFAULT 'SOURCE',
    "confidence" DOUBLE PRECISION,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reviewedRevision" INTEGER,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaperDraftQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamPaperAsset" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftQuestionId" TEXT,
    "kind" VARCHAR(20) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pageNumber" INTEGER,
    "storageKey" VARCHAR(191) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamPaperAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionImage" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "storageKey" VARCHAR(191) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentQuestionImage" (
    "id" TEXT NOT NULL,
    "assignmentQuestionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "storageKey" VARCHAR(191) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "mimeType" VARCHAR(40) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentQuestionImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaperDraft_jobId_key" ON "ExamPaperDraft"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaperDraft_publishedExamId_key" ON "ExamPaperDraft"("publishedExamId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaperDraft_sourceStorageKey_key" ON "ExamPaperDraft"("sourceStorageKey");

-- CreateIndex
CREATE INDEX "ExamPaperDraft_teacherId_status_updatedAt_idx" ON "ExamPaperDraft"("teacherId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "ExamPaperDraft_courseId_createdAt_idx" ON "ExamPaperDraft"("courseId", "createdAt");

-- CreateIndex
CREATE INDEX "ExamPaperDraftQuestion_draftId_reviewedRevision_idx" ON "ExamPaperDraftQuestion"("draftId", "reviewedRevision");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaperDraftQuestion_draftId_ordinal_key" ON "ExamPaperDraftQuestion"("draftId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "ExamPaperAsset_storageKey_key" ON "ExamPaperAsset"("storageKey");

-- CreateIndex
CREATE INDEX "ExamPaperAsset_draftId_kind_pageNumber_idx" ON "ExamPaperAsset"("draftId", "kind", "pageNumber");

-- CreateIndex
CREATE INDEX "ExamPaperAsset_draftQuestionId_kind_idx" ON "ExamPaperAsset"("draftQuestionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImage_storageKey_key" ON "QuestionImage"("storageKey");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImage_questionId_sortOrder_key" ON "QuestionImage"("questionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQuestionImage_assignmentQuestionId_sortOrder_key" ON "AssignmentQuestionImage"("assignmentQuestionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ExamPaperDraft" ADD CONSTRAINT "ExamPaperDraft_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperDraft" ADD CONSTRAINT "ExamPaperDraft_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperDraft" ADD CONSTRAINT "ExamPaperDraft_questionCategoryId_fkey" FOREIGN KEY ("questionCategoryId") REFERENCES "QuestionCourseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperDraft" ADD CONSTRAINT "ExamPaperDraft_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "BackgroundJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperDraft" ADD CONSTRAINT "ExamPaperDraft_publishedExamId_fkey" FOREIGN KEY ("publishedExamId") REFERENCES "ExamSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperDraftQuestion" ADD CONSTRAINT "ExamPaperDraftQuestion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ExamPaperDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperAsset" ADD CONSTRAINT "ExamPaperAsset_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "ExamPaperDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamPaperAsset" ADD CONSTRAINT "ExamPaperAsset_draftQuestionId_fkey" FOREIGN KEY ("draftQuestionId") REFERENCES "ExamPaperDraftQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionImage" ADD CONSTRAINT "QuestionImage_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuestionImage" ADD CONSTRAINT "AssignmentQuestionImage_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
