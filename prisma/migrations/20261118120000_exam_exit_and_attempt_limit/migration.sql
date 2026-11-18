ALTER TYPE "ExamSubmissionReason" ADD VALUE 'PAGE_EXIT';

ALTER TABLE "ExamSession"
  ADD COLUMN "autoSubmitOnExit" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "allowedAttempts" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "ExamSession_allowedAttempts_check" CHECK ("allowedAttempts" BETWEEN 1 AND 20);

ALTER TABLE "ExamPaperDraft"
  ADD COLUMN "autoSubmitOnExit" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "allowedAttempts" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "ExamPaperDraft_allowedAttempts_check" CHECK ("allowedAttempts" BETWEEN 1 AND 20);
