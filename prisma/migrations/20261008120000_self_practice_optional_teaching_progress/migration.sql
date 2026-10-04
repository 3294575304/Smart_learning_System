-- Self-directed practice uses the published course graph without requiring a
-- teaching-progress revision. Existing cycles and their provenance are retained.
ALTER TABLE "CourseRecommendationCycle"
ALTER COLUMN "teachingProgressRevisionId" DROP NOT NULL;
