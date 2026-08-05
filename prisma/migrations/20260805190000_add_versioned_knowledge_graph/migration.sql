ALTER TYPE "AuditAction" ADD VALUE 'KNOWLEDGE_GRAPH_GENERATED';
ALTER TYPE "AuditAction" ADD VALUE 'KNOWLEDGE_GRAPH_REVIEW_SAVED';
ALTER TYPE "AuditAction" ADD VALUE 'KNOWLEDGE_GRAPH_PUBLISHED';
ALTER TYPE "AuditTargetType" ADD VALUE 'KNOWLEDGE_GRAPH_DRAFT';
ALTER TYPE "AuditTargetType" ADD VALUE 'KNOWLEDGE_GRAPH_REVIEW';
ALTER TYPE "AuditTargetType" ADD VALUE 'KNOWLEDGE_GRAPH_VERSION';

CREATE TYPE "KnowledgeGraphStatus" AS ENUM ('PENDING','PROCESSING','SUCCEEDED','FAILED');
CREATE TYPE "KnowledgeGraphNodeType" AS ENUM ('COURSE','CHAPTER','KNOWLEDGE_POINT');
CREATE TYPE "KnowledgeGraphRelationType" AS ENUM ('CONTAINS','PREREQUISITE','RELATED');
CREATE TYPE "KnowledgeGraphSourceType" AS ENUM ('SYLLABUS','AI_INFERRED','TEACHER');

ALTER TABLE "Course" ADD COLUMN "currentPublishedKnowledgeGraphVersionId" TEXT;

CREATE TABLE "KnowledgeGraphDraft" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "sourceSyllabusStructureId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL, "status" "KnowledgeGraphStatus" NOT NULL DEFAULT 'PENDING',
  "generatorVersion" VARCHAR(50) NOT NULL, "promptVersion" VARCHAR(50) NOT NULL, "ruleVersion" VARCHAR(50) NOT NULL,
  "provider" VARCHAR(100), "model" VARCHAR(150), "retryCount" INTEGER NOT NULL DEFAULT 0,
  "executionCount" INTEGER NOT NULL DEFAULT 0, "progress" INTEGER NOT NULL DEFAULT 0,
  "successCount" INTEGER NOT NULL DEFAULT 0, "failureCount" INTEGER NOT NULL DEFAULT 0,
  "deterministicStructureJson" JSONB, "aiInferenceJson" JSONB, "generatedStructureJson" JSONB,
  "errorCode" VARCHAR(100), "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeGraphDraft_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeGraphReviewRevision" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "graphDraftId" TEXT NOT NULL,
  "sourceSyllabusStructureId" TEXT NOT NULL, "editedById" TEXT NOT NULL, "revisionNumber" INTEGER NOT NULL,
  "structureJson" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeGraphReviewRevision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishedKnowledgeGraphVersion" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "sourceSyllabusStructureId" TEXT NOT NULL,
  "graphDraftId" TEXT NOT NULL, "reviewRevisionId" TEXT NOT NULL, "publishedById" TEXT NOT NULL,
  "versionNumber" INTEGER NOT NULL, "structureJson" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PublishedKnowledgeGraphVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "KnowledgeGraphConcept" (
  "id" TEXT NOT NULL, "courseId" TEXT NOT NULL, "stableKey" VARCHAR(191) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeGraphConcept_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishedKnowledgeGraphNode" (
  "id" TEXT NOT NULL, "graphVersionId" TEXT NOT NULL, "conceptId" TEXT NOT NULL,
  "nodeType" "KnowledgeGraphNodeType" NOT NULL, "code" VARCHAR(100) NOT NULL, "name" VARCHAR(300) NOT NULL,
  "description" TEXT, "importance" VARCHAR(30), "isKeyTopic" BOOLEAN NOT NULL DEFAULT false,
  "isDifficultTopic" BOOLEAN NOT NULL DEFAULT false, "objectiveMappings" JSONB, "assessmentMappings" JSONB,
  "sourceType" "KnowledgeGraphSourceType" NOT NULL, "sourceRefs" JSONB NOT NULL, "confidence" DECIMAL(5,4),
  "sourcePath" VARCHAR(500), "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedKnowledgeGraphNode_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PublishedKnowledgeGraphEdge" (
  "id" TEXT NOT NULL, "graphVersionId" TEXT NOT NULL, "fromNodeId" TEXT NOT NULL, "toNodeId" TEXT NOT NULL,
  "relationType" "KnowledgeGraphRelationType" NOT NULL, "description" TEXT,
  "sourceType" "KnowledgeGraphSourceType" NOT NULL, "sourceRefs" JSONB NOT NULL, "confidence" DECIMAL(5,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PublishedKnowledgeGraphEdge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Course_currentPublishedKnowledgeGraphVersionId_key" ON "Course"("currentPublishedKnowledgeGraphVersionId");
CREATE UNIQUE INDEX "KnowledgeGraphDraft_sourceSyllabusStructureId_generatorVersion_key" ON "KnowledgeGraphDraft"("sourceSyllabusStructureId","generatorVersion");
CREATE INDEX "KnowledgeGraphDraft_courseId_status_createdAt_idx" ON "KnowledgeGraphDraft"("courseId","status","createdAt");
CREATE INDEX "KnowledgeGraphDraft_requestedById_createdAt_idx" ON "KnowledgeGraphDraft"("requestedById","createdAt");
CREATE UNIQUE INDEX "KnowledgeGraphReviewRevision_graphDraftId_revisionNumber_key" ON "KnowledgeGraphReviewRevision"("graphDraftId","revisionNumber");
CREATE INDEX "KnowledgeGraphReviewRevision_courseId_createdAt_idx" ON "KnowledgeGraphReviewRevision"("courseId","createdAt");
CREATE INDEX "KnowledgeGraphReviewRevision_editedById_createdAt_idx" ON "KnowledgeGraphReviewRevision"("editedById","createdAt");
CREATE UNIQUE INDEX "PublishedKnowledgeGraphVersion_reviewRevisionId_key" ON "PublishedKnowledgeGraphVersion"("reviewRevisionId");
CREATE UNIQUE INDEX "PublishedKnowledgeGraphVersion_courseId_versionNumber_key" ON "PublishedKnowledgeGraphVersion"("courseId","versionNumber");
CREATE INDEX "PublishedKnowledgeGraphVersion_courseId_publishedAt_idx" ON "PublishedKnowledgeGraphVersion"("courseId","publishedAt");
CREATE INDEX "PublishedKnowledgeGraphVersion_sourceSyllabusStructureId_idx" ON "PublishedKnowledgeGraphVersion"("sourceSyllabusStructureId");
CREATE UNIQUE INDEX "KnowledgeGraphConcept_courseId_stableKey_key" ON "KnowledgeGraphConcept"("courseId","stableKey");
CREATE INDEX "KnowledgeGraphConcept_courseId_createdAt_idx" ON "KnowledgeGraphConcept"("courseId","createdAt");
CREATE UNIQUE INDEX "PublishedKnowledgeGraphNode_graphVersionId_code_key" ON "PublishedKnowledgeGraphNode"("graphVersionId","code");
CREATE UNIQUE INDEX "PublishedKnowledgeGraphNode_graphVersionId_conceptId_key" ON "PublishedKnowledgeGraphNode"("graphVersionId","conceptId");
CREATE INDEX "PublishedKnowledgeGraphNode_graphVersionId_nodeType_sortOrder_idx" ON "PublishedKnowledgeGraphNode"("graphVersionId","nodeType","sortOrder");
CREATE INDEX "PublishedKnowledgeGraphNode_conceptId_idx" ON "PublishedKnowledgeGraphNode"("conceptId");
CREATE UNIQUE INDEX "PublishedKnowledgeGraphEdge_graphVersionId_relationType_fromNodeId_toNodeId_key" ON "PublishedKnowledgeGraphEdge"("graphVersionId","relationType","fromNodeId","toNodeId");
CREATE INDEX "PublishedKnowledgeGraphEdge_graphVersionId_relationType_idx" ON "PublishedKnowledgeGraphEdge"("graphVersionId","relationType");
CREATE INDEX "PublishedKnowledgeGraphEdge_fromNodeId_idx" ON "PublishedKnowledgeGraphEdge"("fromNodeId");
CREATE INDEX "PublishedKnowledgeGraphEdge_toNodeId_idx" ON "PublishedKnowledgeGraphEdge"("toNodeId");

ALTER TABLE "KnowledgeGraphDraft" ADD CONSTRAINT "KnowledgeGraphDraft_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphDraft" ADD CONSTRAINT "KnowledgeGraphDraft_sourceSyllabusStructureId_fkey" FOREIGN KEY ("sourceSyllabusStructureId") REFERENCES "PublishedSyllabusStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphDraft" ADD CONSTRAINT "KnowledgeGraphDraft_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphReviewRevision" ADD CONSTRAINT "KnowledgeGraphReviewRevision_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphReviewRevision" ADD CONSTRAINT "KnowledgeGraphReviewRevision_graphDraftId_fkey" FOREIGN KEY ("graphDraftId") REFERENCES "KnowledgeGraphDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphReviewRevision" ADD CONSTRAINT "KnowledgeGraphReviewRevision_sourceSyllabusStructureId_fkey" FOREIGN KEY ("sourceSyllabusStructureId") REFERENCES "PublishedSyllabusStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphReviewRevision" ADD CONSTRAINT "KnowledgeGraphReviewRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphVersion" ADD CONSTRAINT "PublishedKnowledgeGraphVersion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphVersion" ADD CONSTRAINT "PublishedKnowledgeGraphVersion_sourceSyllabusStructureId_fkey" FOREIGN KEY ("sourceSyllabusStructureId") REFERENCES "PublishedSyllabusStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphVersion" ADD CONSTRAINT "PublishedKnowledgeGraphVersion_graphDraftId_fkey" FOREIGN KEY ("graphDraftId") REFERENCES "KnowledgeGraphDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphVersion" ADD CONSTRAINT "PublishedKnowledgeGraphVersion_reviewRevisionId_fkey" FOREIGN KEY ("reviewRevisionId") REFERENCES "KnowledgeGraphReviewRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphVersion" ADD CONSTRAINT "PublishedKnowledgeGraphVersion_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KnowledgeGraphConcept" ADD CONSTRAINT "KnowledgeGraphConcept_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphNode" ADD CONSTRAINT "PublishedKnowledgeGraphNode_graphVersionId_fkey" FOREIGN KEY ("graphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphNode" ADD CONSTRAINT "PublishedKnowledgeGraphNode_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "KnowledgeGraphConcept"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphEdge" ADD CONSTRAINT "PublishedKnowledgeGraphEdge_graphVersionId_fkey" FOREIGN KEY ("graphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphEdge" ADD CONSTRAINT "PublishedKnowledgeGraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PublishedKnowledgeGraphEdge" ADD CONSTRAINT "PublishedKnowledgeGraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "PublishedKnowledgeGraphNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Course" ADD CONSTRAINT "Course_currentPublishedKnowledgeGraphVersionId_fkey" FOREIGN KEY ("currentPublishedKnowledgeGraphVersionId") REFERENCES "PublishedKnowledgeGraphVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
