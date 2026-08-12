-- Iteration six foundation: versioned teaching progress and course-scoped recommendation cycles.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COURSE_TEACHING_PROGRESS_UPDATED';

ALTER TABLE "Course"
  ADD COLUMN "currentTeachingProgressRevisionId" TEXT,
  ADD COLUMN "currentRecommendationPolicyRevisionId" TEXT;

ALTER TABLE "PersonalizedRecommendation"
  ADD COLUMN "courseCycleId" TEXT,
  ADD COLUMN "targetConceptId" TEXT,
  ADD COLUMN "rankingScore" DECIMAL(8,2),
  ADD COLUMN "reasonCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "CourseTeachingProgressRevision" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "graphVersionId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseTeachingProgressRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseTeachingProgressConcept" (
  "id" TEXT NOT NULL,
  "progressRevisionId" TEXT NOT NULL,
  "conceptId" TEXT NOT NULL,
  "publishedNodeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseTeachingProgressConcept_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseRecommendationPolicyRevision" (
  "id" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "revisionNumber" INTEGER NOT NULL,
  "ruleVersion" VARCHAR(50) NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "weaknessWeight" INTEGER NOT NULL DEFAULT 35,
  "prerequisiteWeight" INTEGER NOT NULL DEFAULT 20,
  "difficultyWeight" INTEGER NOT NULL DEFAULT 15,
  "errorPatternWeight" INTEGER NOT NULL DEFAULT 10,
  "freshnessWeight" INTEGER NOT NULL DEFAULT 10,
  "teacherPriorityWeight" INTEGER NOT NULL DEFAULT 10,
  "recentWindowDays" INTEGER NOT NULL DEFAULT 14,
  "difficultyTolerance" INTEGER NOT NULL DEFAULT 1,
  "maxQuestionCount" INTEGER NOT NULL DEFAULT 20,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseRecommendationPolicyRevision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CourseRecommendationCycle" (
  "id" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "courseId" TEXT NOT NULL,
  "classroomId" TEXT NOT NULL,
  "graphVersionId" TEXT NOT NULL,
  "profileSnapshotId" TEXT,
  "masteryRevisionId" TEXT,
  "teachingProgressRevisionId" TEXT NOT NULL,
  "policyRevisionId" TEXT NOT NULL,
  "cycleKey" VARCHAR(191) NOT NULL,
  "inputFingerprint" CHAR(64) NOT NULL,
  "requestSnapshot" JSONB NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CourseRecommendationCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Course_currentTeachingProgressRevisionId_key" ON "Course"("currentTeachingProgressRevisionId");
CREATE UNIQUE INDEX "Course_currentRecommendationPolicyRevisionId_key" ON "Course"("currentRecommendationPolicyRevisionId");
CREATE UNIQUE INDEX "CourseTeachingProgressRevision_courseId_revisionNumber_key" ON "CourseTeachingProgressRevision"("courseId", "revisionNumber");
CREATE UNIQUE INDEX "CourseTeachingProgressRevision_courseId_inputFingerprint_key" ON "CourseTeachingProgressRevision"("courseId", "inputFingerprint");
CREATE INDEX "CourseTeachingProgressRevision_courseId_createdAt_idx" ON "CourseTeachingProgressRevision"("courseId", "createdAt");
CREATE INDEX "CourseTeachingProgressRevision_graphVersionId_idx" ON "CourseTeachingProgressRevision"("graphVersionId");
CREATE UNIQUE INDEX "CourseTeachingProgressConcept_progressRevisionId_conceptId_key" ON "CourseTeachingProgressConcept"("progressRevisionId", "conceptId");
CREATE UNIQUE INDEX "CourseTeachingProgressConcept_progressRevisionId_publishedNodeId_key" ON "CourseTeachingProgressConcept"("progressRevisionId", "publishedNodeId");
CREATE INDEX "CourseTeachingProgressConcept_conceptId_idx" ON "CourseTeachingProgressConcept"("conceptId");
CREATE INDEX "CourseTeachingProgressConcept_publishedNodeId_idx" ON "CourseTeachingProgressConcept"("publishedNodeId");
CREATE UNIQUE INDEX "CourseRecommendationPolicyRevision_courseId_revisionNumber_key" ON "CourseRecommendationPolicyRevision"("courseId", "revisionNumber");
CREATE UNIQUE INDEX "CourseRecommendationPolicyRevision_courseId_inputFingerprint_key" ON "CourseRecommendationPolicyRevision"("courseId", "inputFingerprint");
CREATE INDEX "CourseRecommendationPolicyRevision_courseId_createdAt_idx" ON "CourseRecommendationPolicyRevision"("courseId", "createdAt");
CREATE UNIQUE INDEX "CourseRecommendationCycle_cycleKey_key" ON "CourseRecommendationCycle"("cycleKey");
CREATE UNIQUE INDEX "CourseRecommendationCycle_studentId_courseId_inputFingerprint_key" ON "CourseRecommendationCycle"("studentId", "courseId", "inputFingerprint");
CREATE INDEX "CourseRecommendationCycle_studentId_courseId_generatedAt_idx" ON "CourseRecommendationCycle"("studentId", "courseId", "generatedAt");
CREATE INDEX "CourseRecommendationCycle_courseId_generatedAt_idx" ON "CourseRecommendationCycle"("courseId", "generatedAt");
CREATE INDEX "CourseRecommendationCycle_classroomId_generatedAt_idx" ON "CourseRecommendationCycle"("classroomId", "generatedAt");
CREATE INDEX "PersonalizedRecommendation_courseCycleId_priority_idx" ON "PersonalizedRecommendation"("courseCycleId", "priority");
CREATE INDEX "PersonalizedRecommendation_targetConceptId_status_idx" ON "PersonalizedRecommendation"("targetConceptId", "status");

ALTER TABLE "CourseTeachingProgressRevision" ADD CONSTRAINT "CourseTeachingProgressRevision_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseTeachingProgressRevision" ADD CONSTRAINT "CourseTeachingProgressRevision_graphVersionId_fkey" FOREIGN KEY ("graphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseTeachingProgressRevision" ADD CONSTRAINT "CourseTeachingProgressRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseTeachingProgressConcept" ADD CONSTRAINT "CourseTeachingProgressConcept_progressRevisionId_fkey" FOREIGN KEY ("progressRevisionId") REFERENCES "CourseTeachingProgressRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseTeachingProgressConcept" ADD CONSTRAINT "CourseTeachingProgressConcept_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseTeachingProgressConcept" ADD CONSTRAINT "CourseTeachingProgressConcept_publishedNodeId_fkey" FOREIGN KEY ("publishedNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationPolicyRevision" ADD CONSTRAINT "CourseRecommendationPolicyRevision_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationPolicyRevision" ADD CONSTRAINT "CourseRecommendationPolicyRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_graphVersionId_fkey" FOREIGN KEY ("graphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "LearnerProfileSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_masteryRevisionId_fkey" FOREIGN KEY ("masteryRevisionId") REFERENCES "StudentCourseConceptMasteryRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_teachingProgressRevisionId_fkey" FOREIGN KEY ("teachingProgressRevisionId") REFERENCES "CourseTeachingProgressRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CourseRecommendationCycle" ADD CONSTRAINT "CourseRecommendationCycle_policyRevisionId_fkey" FOREIGN KEY ("policyRevisionId") REFERENCES "CourseRecommendationPolicyRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalizedRecommendation" ADD CONSTRAINT "PersonalizedRecommendation_courseCycleId_fkey" FOREIGN KEY ("courseCycleId") REFERENCES "CourseRecommendationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalizedRecommendation" ADD CONSTRAINT "PersonalizedRecommendation_targetConceptId_fkey" FOREIGN KEY ("targetConceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_currentTeachingProgressRevisionId_fkey" FOREIGN KEY ("currentTeachingProgressRevisionId") REFERENCES "CourseTeachingProgressRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_currentRecommendationPolicyRevisionId_fkey" FOREIGN KEY ("currentRecommendationPolicyRevisionId") REFERENCES "CourseRecommendationPolicyRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
