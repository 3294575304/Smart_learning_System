-- Nullable and deliberately not backfilled: historical raw scores stay unchanged.
ALTER TABLE "PersonalizedRecommendation"
  ADD COLUMN "assignedPoints" DECIMAL(8,2),
  ADD COLUMN "scoringRuleVersion" TEXT;
ALTER TABLE "PersonalizedRecommendation" ADD CONSTRAINT "recommendation_frozen_points_valid"
  CHECK (("assignedPoints" IS NULL AND "scoringRuleVersion" IS NULL)
    OR ("assignedPoints" IS NOT NULL AND "assignedPoints" > 0 AND "assignedPoints" <= 100
      AND "scoringRuleVersion" IS NOT NULL));
-- Application rollback: retain these nullable columns; do not rewrite generated scores.
