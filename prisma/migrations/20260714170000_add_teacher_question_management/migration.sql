-- Teacher question bank: use a 1-5 difficulty scale, add tags, and support soft deletion.
DROP INDEX "Question_creatorId_status_createdAt_idx";
DROP INDEX "Question_visibility_status_type_difficulty_idx";

ALTER TABLE "Question"
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "deletedAt" TIMESTAMP(3),
ALTER COLUMN "difficulty" TYPE INTEGER USING (
  CASE "difficulty"::text
    WHEN 'EASY' THEN 1
    WHEN 'MEDIUM' THEN 3
    WHEN 'HARD' THEN 5
  END
);

ALTER TABLE "AssignmentQuestion"
ALTER COLUMN "difficultySnapshot" TYPE INTEGER USING (
  CASE "difficultySnapshot"::text
    WHEN 'EASY' THEN 1
    WHEN 'MEDIUM' THEN 3
    WHEN 'HARD' THEN 5
  END
);

ALTER TABLE "PersonalizedRecommendation"
ALTER COLUMN "targetDifficulty" TYPE INTEGER USING (
  CASE "targetDifficulty"::text
    WHEN 'EASY' THEN 1
    WHEN 'MEDIUM' THEN 3
    WHEN 'HARD' THEN 5
  END
);

DROP TYPE "QuestionDifficulty";

CREATE INDEX "Question_creatorId_status_deletedAt_createdAt_idx"
ON "Question"("creatorId", "status", "deletedAt", "createdAt");

CREATE INDEX "Question_visibility_status_deletedAt_type_difficulty_idx"
ON "Question"("visibility", "status", "deletedAt", "type", "difficulty");

ALTER TABLE "Question"
ADD CONSTRAINT "Question_difficulty_check" CHECK ("difficulty" BETWEEN 1 AND 5);

ALTER TABLE "AssignmentQuestion"
ADD CONSTRAINT "AssignmentQuestion_difficultySnapshot_check" CHECK ("difficultySnapshot" BETWEEN 1 AND 5);

ALTER TABLE "PersonalizedRecommendation"
ADD CONSTRAINT "PersonalizedRecommendation_targetDifficulty_check" CHECK ("targetDifficulty" BETWEEN 1 AND 5);
