CREATE TABLE "RecommendationPracticeAnswer" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "textAnswer" TEXT,
    "booleanAnswer" BOOLEAN,
    "selectedOptionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responseTimeMs" INTEGER,
    "score" DECIMAL(8,2) NOT NULL,
    "maxScore" DECIMAL(8,2) NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationPracticeAnswer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecommendationPracticeAnswer_recommendationId_key"
ON "RecommendationPracticeAnswer"("recommendationId");

CREATE UNIQUE INDEX "RecommendationPracticeAnswer_idempotencyKey_key"
ON "RecommendationPracticeAnswer"("idempotencyKey");

CREATE INDEX "RecommendationPracticeAnswer_questionId_isCorrect_idx"
ON "RecommendationPracticeAnswer"("questionId", "isCorrect");

CREATE INDEX "RecommendationPracticeAnswer_createdAt_idx"
ON "RecommendationPracticeAnswer"("createdAt");

ALTER TABLE "RecommendationPracticeAnswer"
ADD CONSTRAINT "RecommendationPracticeAnswer_recommendationId_fkey"
FOREIGN KEY ("recommendationId") REFERENCES "PersonalizedRecommendation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecommendationPracticeAnswer"
ADD CONSTRAINT "RecommendationPracticeAnswer_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "Question"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WrongQuestion"
ALTER COLUMN "studentAnswerId" DROP NOT NULL,
ALTER COLUMN "assignmentQuestionId" DROP NOT NULL,
ADD COLUMN "recommendationAnswerId" TEXT,
ADD COLUMN "questionId" TEXT,
ADD COLUMN "wrongCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "lastWrongAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "WrongQuestion_recommendationAnswerId_key"
ON "WrongQuestion"("recommendationAnswerId");

CREATE UNIQUE INDEX "WrongQuestion_studentId_questionId_key"
ON "WrongQuestion"("studentId", "questionId");

CREATE INDEX "WrongQuestion_questionId_isResolved_idx"
ON "WrongQuestion"("questionId", "isResolved");

ALTER TABLE "WrongQuestion"
ADD CONSTRAINT "WrongQuestion_recommendationAnswerId_fkey"
FOREIGN KEY ("recommendationAnswerId") REFERENCES "RecommendationPracticeAnswer"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WrongQuestion"
ADD CONSTRAINT "WrongQuestion_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "Question"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
