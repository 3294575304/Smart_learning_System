CREATE TYPE "ExamSubmissionReason" AS ENUM ('MANUAL', 'TIME_UP', 'SWITCH_LIMIT');

ALTER TABLE "Submission"
ADD COLUMN "examSubmissionReason" "ExamSubmissionReason";
