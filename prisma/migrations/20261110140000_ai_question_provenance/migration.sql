CREATE TYPE "QuestionOrigin" AS ENUM ('MANUAL', 'AI_GENERATED', 'AI_ASSISTED');

ALTER TABLE "Question" ADD COLUMN "origin" "QuestionOrigin" NOT NULL DEFAULT 'MANUAL';

ALTER TABLE "AIQuestionGenerationBatch"
  ADD COLUMN "firstValidationChecks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "firstValidationPasses" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "AIQuestionGenerationBatch_first_validation_counts_check"
    CHECK ("firstValidationPasses" >= 0 AND "firstValidationChecks" >= "firstValidationPasses");

CREATE INDEX "AIQuestionGenerationBatch_questionCategoryId_createdAt_idx"
  ON "AIQuestionGenerationBatch" ("questionCategoryId", "createdAt");

-- Only the confirmed candidate relation can establish AI origin. Compare against
-- the initial draft, so a reverted edit or a tag/target edit stays direct adoption.
WITH confirmed AS (
  SELECT c."confirmedQuestionId", c."questionJson", c."programmingConfig",
         (
           SELECT entry
           FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(c."reviewHistory") = 'array' THEN c."reviewHistory" ELSE '[]'::jsonb END
           ) AS history(entry)
           WHERE entry->'revision' = '1'::jsonb
           LIMIT 1
         ) AS original
  FROM "AIQuestionGenerationCandidate" c
  WHERE c."status" = 'CONFIRMED' AND c."confirmedQuestionId" IS NOT NULL
)
UPDATE "Question" q
SET "origin" = CASE
  WHEN c.original IS NOT NULL AND (
    COALESCE(c.original->'programmingConfig', 'null'::jsonb)
      IS DISTINCT FROM COALESCE(c."programmingConfig", 'null'::jsonb)
    OR EXISTS (
      SELECT 1 FROM unnest(ARRAY['title','content','type','options','answer','explanation']) AS field(name)
      WHERE c.original->'questionJson'->field.name IS DISTINCT FROM c."questionJson"->field.name
    )
  ) THEN 'AI_ASSISTED'::"QuestionOrigin"
  ELSE 'AI_GENERATED'::"QuestionOrigin"
END
FROM confirmed c
WHERE q.id = c."confirmedQuestionId" AND q."origin" = 'MANUAL';
