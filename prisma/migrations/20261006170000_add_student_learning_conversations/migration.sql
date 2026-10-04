CREATE TABLE "StudentLearningConversation" (
 "id" TEXT NOT NULL,
 "studentId" TEXT NOT NULL,
 "courseId" TEXT NOT NULL,
 "topicKind" VARCHAR(30) NOT NULL,
 "topicId" TEXT NOT NULL,
 "topicName" VARCHAR(300) NOT NULL,
 "title" VARCHAR(120) NOT NULL,
 "firstRequestId" TEXT NOT NULL,
 "turns" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 0,
 "deletedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "StudentLearningConversation_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "StudentLearningConversation_topicKind_check" CHECK ("topicKind" IN ('KNOWLEDGE_POINT', 'CHAPTER')),
 CONSTRAINT "StudentLearningConversation_turns_check" CHECK (jsonb_typeof("turns") = 'array')
);
CREATE UNIQUE INDEX "StudentLearningConversation_firstRequestId_key" ON "StudentLearningConversation"("firstRequestId");
CREATE INDEX "StudentLearningConversation_studentId_courseId_deletedAt_upd_idx" ON "StudentLearningConversation"("studentId", "courseId", "deletedAt", "updatedAt");
ALTER TABLE "StudentLearningConversation" ADD CONSTRAINT "StudentLearningConversation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentLearningConversation" ADD CONSTRAINT "StudentLearningConversation_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
