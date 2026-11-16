-- Additive migration: historical code and frozen configurations remain Python.
CREATE TYPE "ProgrammingLanguage" AS ENUM ('PYTHON', 'C', 'CPP', 'JAVA', 'JAVASCRIPT');
ALTER TABLE "StudentAnswer" ADD COLUMN "codeLanguage" "ProgrammingLanguage" NOT NULL DEFAULT 'PYTHON';
ALTER TABLE "ProgrammingAttempt" ADD COLUMN "language" "ProgrammingLanguage" NOT NULL DEFAULT 'PYTHON';
ALTER TABLE "ProgrammingQuestionConfigRevision" ADD COLUMN "language" "ProgrammingLanguage" NOT NULL DEFAULT 'PYTHON';
