CREATE TYPE "QuestionGraphBindingType" AS ENUM ('PRIMARY', 'SECONDARY');

ALTER TYPE "AuditAction" ADD VALUE 'QUESTION_GRAPH_BINDINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'QUESTION_GRAPH_BINDINGS_CLEARED';

CREATE TABLE "QuestionKnowledgeGraphBindingSet" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionKnowledgeGraphBindingSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuestionKnowledgeGraphBinding" (
    "id" TEXT NOT NULL,
    "bindingSetId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "conceptId" TEXT NOT NULL,
    "sourceGraphVersionId" TEXT NOT NULL,
    "sourceNodeId" TEXT NOT NULL,
    "bindingType" "QuestionGraphBindingType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "QuestionKnowledgeGraphBinding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestionKnowledgeGraphBindingSet_questionId_courseId_key" ON "QuestionKnowledgeGraphBindingSet"("questionId", "courseId");
CREATE INDEX "QuestionKnowledgeGraphBindingSet_courseId_updatedAt_idx" ON "QuestionKnowledgeGraphBindingSet"("courseId", "updatedAt");
CREATE UNIQUE INDEX "QuestionKnowledgeGraphBinding_questionId_courseId_conceptId_key" ON "QuestionKnowledgeGraphBinding"("questionId", "courseId", "conceptId");
CREATE UNIQUE INDEX "QuestionKnowledgeGraphBinding_bindingSetId_conceptId_key" ON "QuestionKnowledgeGraphBinding"("bindingSetId", "conceptId");
CREATE INDEX "QuestionKnowledgeGraphBinding_courseId_bindingType_idx" ON "QuestionKnowledgeGraphBinding"("courseId", "bindingType");
CREATE INDEX "QuestionKnowledgeGraphBinding_conceptId_idx" ON "QuestionKnowledgeGraphBinding"("conceptId");
CREATE INDEX "QuestionKnowledgeGraphBinding_sourceGraphVersionId_idx" ON "QuestionKnowledgeGraphBinding"("sourceGraphVersionId");
CREATE INDEX "QuestionKnowledgeGraphBinding_sourceNodeId_idx" ON "QuestionKnowledgeGraphBinding"("sourceNodeId");
CREATE UNIQUE INDEX "QuestionKnowledgeGraphBinding_one_primary_per_set_key" ON "QuestionKnowledgeGraphBinding"("bindingSetId") WHERE "bindingType" = 'PRIMARY';

ALTER TABLE "QuestionKnowledgeGraphBindingSet" ADD CONSTRAINT "QuestionKnowledgeGraphBindingSet_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBindingSet" ADD CONSTRAINT "QuestionKnowledgeGraphBindingSet_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBinding" ADD CONSTRAINT "QuestionKnowledgeGraphBinding_bindingSetId_fkey" FOREIGN KEY ("bindingSetId") REFERENCES "QuestionKnowledgeGraphBindingSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBinding" ADD CONSTRAINT "QuestionKnowledgeGraphBinding_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBinding" ADD CONSTRAINT "QuestionKnowledgeGraphBinding_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBinding" ADD CONSTRAINT "QuestionKnowledgeGraphBinding_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBinding" ADD CONSTRAINT "QuestionKnowledgeGraphBinding_sourceGraphVersionId_fkey" FOREIGN KEY ("sourceGraphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBinding" ADD CONSTRAINT "QuestionKnowledgeGraphBinding_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuestionKnowledgeGraphBinding" ADD CONSTRAINT "QuestionKnowledgeGraphBinding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
