-- 画像 v2：新增编程维度列
ALTER TABLE "LearnerProfileSnapshot"
    ADD COLUMN "programmingDimension" JSONB NOT NULL DEFAULT '{}';

-- 知识点 ↔ 课程目标映射（仅用于展示与排序，不参与达成度计算）
CREATE TABLE "ConceptObjectiveLink" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "objectiveCode" VARCHAR(50) NOT NULL,
    "weight" DECIMAL(7,4) NOT NULL DEFAULT 1,
    "source" VARCHAR(20) NOT NULL DEFAULT 'DERIVED',
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConceptObjectiveLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConceptObjectiveLink_courseId_conceptId_objectiveCode_key"
    ON "ConceptObjectiveLink"("courseId", "conceptId", "objectiveCode");

CREATE INDEX "ConceptObjectiveLink_courseId_objectiveCode_idx"
    ON "ConceptObjectiveLink"("courseId", "objectiveCode");

CREATE INDEX "ConceptObjectiveLink_conceptId_idx"
    ON "ConceptObjectiveLink"("conceptId");

ALTER TABLE "ConceptObjectiveLink"
    ADD CONSTRAINT "ConceptObjectiveLink_courseId_fkey"
    FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptObjectiveLink"
    ADD CONSTRAINT "ConceptObjectiveLink_conceptId_fkey"
    FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConceptObjectiveLink"
    ADD CONSTRAINT "ConceptObjectiveLink_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
