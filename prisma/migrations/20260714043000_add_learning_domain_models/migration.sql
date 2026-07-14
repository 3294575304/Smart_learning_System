-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ClassroomStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'PENDING_REVIEW', 'GRADED', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "GradingStatus" AS ENUM ('UNGRADED', 'AUTO_GRADED', 'MANUAL_REVIEW_REQUIRED', 'GRADED');

-- CreateEnum
CREATE TYPE "MasteryLevel" AS ENUM ('NOT_STARTED', 'BEGINNER', 'DEVELOPING', 'PROFICIENT', 'MASTERED');

-- CreateEnum
CREATE TYPE "MasteryTrend" AS ENUM ('UNKNOWN', 'UP', 'STABLE', 'DOWN');

-- CreateEnum
CREATE TYPE "AIRecordStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'FALLBACK');

-- CreateEnum
CREATE TYPE "AIAnalysisScope" AS ENUM ('STUDENT', 'CLASSROOM');

-- CreateEnum
CREATE TYPE "AIInsightType" AS ENUM ('STRENGTH', 'WEAKNESS', 'RISK', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "RecommendationSource" AS ENUM ('RULE', 'AI', 'HYBRID');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'STARTED', 'COMPLETED', 'DISMISSED', 'EXPIRED');

-- DropIndex
DROP INDEX "User_role_idx";

-- Preserve existing credentials while moving profile data out of User.
ALTER TABLE "User" RENAME COLUMN "password" TO "passwordHash";

ALTER TABLE "User"
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "phone" TEXT,
    "studentNo" TEXT,
    "teacherNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- Backfill one profile per existing user before removing the legacy name column.
INSERT INTO "UserProfile" (
    "id",
    "userId",
    "displayName",
    "createdAt",
    "updatedAt"
)
SELECT
    'profile_' || "id",
    "id",
    "name",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";

ALTER TABLE "User" DROP COLUMN "name";

-- CreateTable
CREATE TABLE "Classroom" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "joinCode" TEXT NOT NULL,
    "joinCodeExpiresAt" TIMESTAMP(3),
    "status" "ClassroomStatus" NOT NULL DEFAULT 'ACTIVE',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassMembership" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePoint" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "parentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "difficulty" "QuestionDifficulty" NOT NULL,
    "visibility" "QuestionVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "QuestionStatus" NOT NULL DEFAULT 'DRAFT',
    "explanation" TEXT NOT NULL,
    "correctBoolean" BOOLEAN,
    "referenceAnswer" TEXT,
    "acceptableAnswers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isCaseSensitive" BOOLEAN NOT NULL DEFAULT false,
    "gradingConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionOption" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionKnowledgePoint" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "weight" DECIMAL(6,3) NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestionKnowledgePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPoints" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentQuestion" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "points" DECIMAL(8,2) NOT NULL,
    "titleSnapshot" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "typeSnapshot" "QuestionType" NOT NULL,
    "difficultySnapshot" "QuestionDifficulty" NOT NULL,
    "explanationSnapshot" TEXT NOT NULL,
    "correctBooleanSnapshot" BOOLEAN,
    "referenceAnswerSnapshot" TEXT,
    "acceptableAnswersSnapshot" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isCaseSensitiveSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "gradingConfigSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentQuestionOption" (
    "id" TEXT NOT NULL,
    "assignmentQuestionId" TEXT NOT NULL,
    "sourceOptionId" TEXT,
    "labelSnapshot" TEXT NOT NULL,
    "contentSnapshot" TEXT NOT NULL,
    "isCorrectSnapshot" BOOLEAN NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentQuestionOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentQuestionKnowledgePoint" (
    "id" TEXT NOT NULL,
    "assignmentQuestionId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "codeSnapshot" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "weightSnapshot" DECIMAL(6,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentQuestionKnowledgePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "score" DECIMAL(10,2),
    "maxScore" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "assignmentQuestionId" TEXT NOT NULL,
    "graderId" TEXT,
    "textAnswer" TEXT,
    "booleanAnswer" BOOLEAN,
    "gradingStatus" "GradingStatus" NOT NULL DEFAULT 'UNGRADED',
    "score" DECIMAL(8,2),
    "maxScore" DECIMAL(8,2) NOT NULL,
    "isCorrect" BOOLEAN,
    "teacherFeedback" TEXT,
    "gradedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentAnswerOption" (
    "id" TEXT NOT NULL,
    "studentAnswerId" TEXT NOT NULL,
    "assignmentQuestionOptionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentAnswerOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WrongQuestion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentAnswerId" TEXT NOT NULL,
    "assignmentQuestionId" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "firstWrongAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WrongQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentKnowledgeMastery" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "level" "MasteryLevel" NOT NULL DEFAULT 'NOT_STARTED',
    "trend" "MasteryTrend" NOT NULL DEFAULT 'UNKNOWN',
    "masteryScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "earnedPoints" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "availablePoints" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "answeredCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceStartedAt" TIMESTAMP(3),
    "sourceEndedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentKnowledgeMastery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "studentId" TEXT,
    "classroomId" TEXT,
    "scope" "AIAnalysisScope" NOT NULL,
    "status" "AIRecordStatus" NOT NULL DEFAULT 'PENDING',
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'UNKNOWN',
    "summary" TEXT,
    "overallScore" DECIMAL(5,2),
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "basedOnFrom" TIMESTAMP(3),
    "basedOnTo" TIMESTAMP(3),
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "inputMetrics" JSONB,
    "rawResponse" JSONB,
    "errorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysisInsight" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "knowledgePointId" TEXT,
    "type" "AIInsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "metricName" TEXT,
    "metricValue" DECIMAL(12,4),
    "recommendedAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAnalysisInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalizedRecommendation" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "knowledgePointId" TEXT,
    "analysisId" TEXT,
    "cycleKey" TEXT NOT NULL,
    "source" "RecommendationSource" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "targetDifficulty" "QuestionDifficulty" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "wasCorrect" BOOLEAN,
    "score" DECIMAL(8,2),
    "maxScore" DECIMAL(8,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalizedRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITutoringRecord" (
    "id" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "knowledgePointId" TEXT,
    "status" "AIRecordStatus" NOT NULL DEFAULT 'PENDING',
    "prompt" TEXT NOT NULL,
    "answer" TEXT,
    "explanationSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "provider" TEXT,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DECIMAL(5,4),
    "safetyFlagged" BOOLEAN NOT NULL DEFAULT false,
    "inputContext" JSONB,
    "rawResponse" JSONB,
    "errorCode" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AITutoringRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_studentNo_key" ON "UserProfile"("studentNo");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_teacherNo_key" ON "UserProfile"("teacherNo");

-- CreateIndex
CREATE INDEX "UserProfile_displayName_idx" ON "UserProfile"("displayName");

-- CreateIndex
CREATE UNIQUE INDEX "Classroom_joinCode_key" ON "Classroom"("joinCode");

-- CreateIndex
CREATE INDEX "Classroom_teacherId_status_idx" ON "Classroom"("teacherId", "status");

-- CreateIndex
CREATE INDEX "Classroom_status_createdAt_idx" ON "Classroom"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ClassMembership_studentId_status_idx" ON "ClassMembership"("studentId", "status");

-- CreateIndex
CREATE INDEX "ClassMembership_classroomId_status_idx" ON "ClassMembership"("classroomId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ClassMembership_classroomId_studentId_key" ON "ClassMembership"("classroomId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePoint_code_key" ON "KnowledgePoint"("code");

-- CreateIndex
CREATE INDEX "KnowledgePoint_parentId_isActive_idx" ON "KnowledgePoint"("parentId", "isActive");

-- CreateIndex
CREATE INDEX "KnowledgePoint_name_idx" ON "KnowledgePoint"("name");

-- CreateIndex
CREATE INDEX "Question_creatorId_status_createdAt_idx" ON "Question"("creatorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Question_visibility_status_type_difficulty_idx" ON "Question"("visibility", "status", "type", "difficulty");

-- CreateIndex
CREATE INDEX "Question_type_difficulty_idx" ON "Question"("type", "difficulty");

-- CreateIndex
CREATE INDEX "QuestionOption_questionId_isCorrect_idx" ON "QuestionOption"("questionId", "isCorrect");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_label_key" ON "QuestionOption"("questionId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOption_questionId_sortOrder_key" ON "QuestionOption"("questionId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionKnowledgePoint_knowledgePointId_questionId_idx" ON "QuestionKnowledgePoint"("knowledgePointId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionKnowledgePoint_questionId_knowledgePointId_key" ON "QuestionKnowledgePoint"("questionId", "knowledgePointId");

-- CreateIndex
CREATE INDEX "Assignment_classroomId_status_dueAt_idx" ON "Assignment"("classroomId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Assignment_teacherId_status_createdAt_idx" ON "Assignment"("teacherId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentQuestion_questionId_idx" ON "AssignmentQuestion"("questionId");

-- CreateIndex
CREATE INDEX "AssignmentQuestion_assignmentId_typeSnapshot_idx" ON "AssignmentQuestion"("assignmentId", "typeSnapshot");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQuestion_assignmentId_sortOrder_key" ON "AssignmentQuestion"("assignmentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQuestion_assignmentId_questionId_key" ON "AssignmentQuestion"("assignmentId", "questionId");

-- CreateIndex
CREATE INDEX "AssignmentQuestionOption_assignmentQuestionId_isCorrectSnap_idx" ON "AssignmentQuestionOption"("assignmentQuestionId", "isCorrectSnapshot");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQuestionOption_assignmentQuestionId_sortOrder_key" ON "AssignmentQuestionOption"("assignmentQuestionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQuestionOption_assignmentQuestionId_labelSnapshot_key" ON "AssignmentQuestionOption"("assignmentQuestionId", "labelSnapshot");

-- CreateIndex
CREATE INDEX "AssignmentQuestionKnowledgePoint_knowledgePointId_assignmen_idx" ON "AssignmentQuestionKnowledgePoint"("knowledgePointId", "assignmentQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentQuestionKnowledgePoint_assignmentQuestionId_knowl_key" ON "AssignmentQuestionKnowledgePoint"("assignmentQuestionId", "knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_idempotencyKey_key" ON "Submission"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Submission_assignmentId_status_submittedAt_idx" ON "Submission"("assignmentId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "Submission_studentId_status_createdAt_idx" ON "Submission"("studentId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_assignmentId_studentId_attemptNumber_key" ON "Submission"("assignmentId", "studentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "StudentAnswer_assignmentQuestionId_gradingStatus_idx" ON "StudentAnswer"("assignmentQuestionId", "gradingStatus");

-- CreateIndex
CREATE INDEX "StudentAnswer_graderId_gradedAt_idx" ON "StudentAnswer"("graderId", "gradedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAnswer_submissionId_assignmentQuestionId_key" ON "StudentAnswer"("submissionId", "assignmentQuestionId");

-- CreateIndex
CREATE INDEX "StudentAnswerOption_assignmentQuestionOptionId_idx" ON "StudentAnswerOption"("assignmentQuestionOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentAnswerOption_studentAnswerId_assignmentQuestionOptio_key" ON "StudentAnswerOption"("studentAnswerId", "assignmentQuestionOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "WrongQuestion_studentAnswerId_key" ON "WrongQuestion"("studentAnswerId");

-- CreateIndex
CREATE INDEX "WrongQuestion_studentId_isResolved_firstWrongAt_idx" ON "WrongQuestion"("studentId", "isResolved", "firstWrongAt");

-- CreateIndex
CREATE INDEX "WrongQuestion_assignmentQuestionId_idx" ON "WrongQuestion"("assignmentQuestionId");

-- CreateIndex
CREATE INDEX "StudentKnowledgeMastery_studentId_level_masteryScore_idx" ON "StudentKnowledgeMastery"("studentId", "level", "masteryScore");

-- CreateIndex
CREATE INDEX "StudentKnowledgeMastery_knowledgePointId_masteryScore_idx" ON "StudentKnowledgeMastery"("knowledgePointId", "masteryScore");

-- CreateIndex
CREATE UNIQUE INDEX "StudentKnowledgeMastery_studentId_knowledgePointId_key" ON "StudentKnowledgeMastery"("studentId", "knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "AIAnalysis_requestKey_key" ON "AIAnalysis"("requestKey");

-- CreateIndex
CREATE INDEX "AIAnalysis_studentId_status_createdAt_idx" ON "AIAnalysis"("studentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AIAnalysis_classroomId_status_createdAt_idx" ON "AIAnalysis"("classroomId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AIAnalysis_requestedById_createdAt_idx" ON "AIAnalysis"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "AIAnalysis_scope_riskLevel_createdAt_idx" ON "AIAnalysis"("scope", "riskLevel", "createdAt");

-- CreateIndex
CREATE INDEX "AIAnalysisInsight_analysisId_type_priority_idx" ON "AIAnalysisInsight"("analysisId", "type", "priority");

-- CreateIndex
CREATE INDEX "AIAnalysisInsight_knowledgePointId_type_idx" ON "AIAnalysisInsight"("knowledgePointId", "type");

-- CreateIndex
CREATE INDEX "PersonalizedRecommendation_studentId_status_priority_create_idx" ON "PersonalizedRecommendation"("studentId", "status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalizedRecommendation_knowledgePointId_status_idx" ON "PersonalizedRecommendation"("knowledgePointId", "status");

-- CreateIndex
CREATE INDEX "PersonalizedRecommendation_analysisId_idx" ON "PersonalizedRecommendation"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalizedRecommendation_studentId_questionId_cycleKey_key" ON "PersonalizedRecommendation"("studentId", "questionId", "cycleKey");

-- CreateIndex
CREATE UNIQUE INDEX "AITutoringRecord_requestKey_key" ON "AITutoringRecord"("requestKey");

-- CreateIndex
CREATE INDEX "AITutoringRecord_studentId_questionId_createdAt_idx" ON "AITutoringRecord"("studentId", "questionId", "createdAt");

-- CreateIndex
CREATE INDEX "AITutoringRecord_status_createdAt_idx" ON "AITutoringRecord"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AITutoringRecord_knowledgePointId_createdAt_idx" ON "AITutoringRecord"("knowledgePointId", "createdAt");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMembership" ADD CONSTRAINT "ClassMembership_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassMembership" ADD CONSTRAINT "ClassMembership_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePoint" ADD CONSTRAINT "KnowledgePoint_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgePoint" ADD CONSTRAINT "KnowledgePoint_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionOption" ADD CONSTRAINT "QuestionOption_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionKnowledgePoint" ADD CONSTRAINT "QuestionKnowledgePoint_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionKnowledgePoint" ADD CONSTRAINT "QuestionKnowledgePoint_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuestion" ADD CONSTRAINT "AssignmentQuestion_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuestion" ADD CONSTRAINT "AssignmentQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuestionOption" ADD CONSTRAINT "AssignmentQuestionOption_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuestionKnowledgePoint" ADD CONSTRAINT "AssignmentQuestionKnowledgePoint_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentQuestionKnowledgePoint" ADD CONSTRAINT "AssignmentQuestionKnowledgePoint_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_graderId_fkey" FOREIGN KEY ("graderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswerOption" ADD CONSTRAINT "StudentAnswerOption_studentAnswerId_fkey" FOREIGN KEY ("studentAnswerId") REFERENCES "StudentAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentAnswerOption" ADD CONSTRAINT "StudentAnswerOption_assignmentQuestionOptionId_fkey" FOREIGN KEY ("assignmentQuestionOptionId") REFERENCES "AssignmentQuestionOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongQuestion" ADD CONSTRAINT "WrongQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongQuestion" ADD CONSTRAINT "WrongQuestion_studentAnswerId_fkey" FOREIGN KEY ("studentAnswerId") REFERENCES "StudentAnswer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WrongQuestion" ADD CONSTRAINT "WrongQuestion_assignmentQuestionId_fkey" FOREIGN KEY ("assignmentQuestionId") REFERENCES "AssignmentQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentKnowledgeMastery" ADD CONSTRAINT "StudentKnowledgeMastery_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentKnowledgeMastery" ADD CONSTRAINT "StudentKnowledgeMastery_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysisInsight" ADD CONSTRAINT "AIAnalysisInsight_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysisInsight" ADD CONSTRAINT "AIAnalysisInsight_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedRecommendation" ADD CONSTRAINT "PersonalizedRecommendation_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedRecommendation" ADD CONSTRAINT "PersonalizedRecommendation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedRecommendation" ADD CONSTRAINT "PersonalizedRecommendation_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalizedRecommendation" ADD CONSTRAINT "PersonalizedRecommendation_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITutoringRecord" ADD CONSTRAINT "AITutoringRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITutoringRecord" ADD CONSTRAINT "AITutoringRecord_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITutoringRecord" ADD CONSTRAINT "AITutoringRecord_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot declare partial indexes. These indexes enforce one current
-- submission and one current recommendation while retaining withdrawn/history rows.
CREATE UNIQUE INDEX "Submission_one_current_per_assignment_student_key"
ON "Submission"("assignmentId", "studentId")
WHERE "status" <> 'WITHDRAWN';

CREATE UNIQUE INDEX "PersonalizedRecommendation_one_active_question_per_student_key"
ON "PersonalizedRecommendation"("studentId", "questionId")
WHERE "status" IN ('PENDING', 'STARTED');

-- Scalar integrity checks that are not expressible in the Prisma schema.
ALTER TABLE "ClassMembership"
ADD CONSTRAINT "ClassMembership_status_timestamps_check" CHECK (
  ("status" = 'ACTIVE' AND "removedAt" IS NULL)
  OR ("status" = 'REMOVED' AND "removedAt" IS NOT NULL)
);

ALTER TABLE "Question"
ADD CONSTRAINT "Question_answer_shape_check" CHECK (
  "status" <> 'ACTIVE'
  OR ("type" IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE') AND "correctBoolean" IS NULL AND "referenceAnswer" IS NULL AND cardinality("acceptableAnswers") = 0)
  OR ("type" = 'TRUE_FALSE' AND "correctBoolean" IS NOT NULL AND "referenceAnswer" IS NULL AND cardinality("acceptableAnswers") = 0)
  OR ("type" = 'FILL_BLANK' AND "correctBoolean" IS NULL AND "referenceAnswer" IS NULL AND cardinality("acceptableAnswers") > 0)
  OR ("type" = 'SHORT_ANSWER' AND "correctBoolean" IS NULL AND "referenceAnswer" IS NOT NULL AND cardinality("acceptableAnswers") = 0)
);

ALTER TABLE "QuestionKnowledgePoint"
ADD CONSTRAINT "QuestionKnowledgePoint_weight_check" CHECK ("weight" > 0);

ALTER TABLE "Assignment"
ADD CONSTRAINT "Assignment_totalPoints_check" CHECK ("totalPoints" >= 0),
ADD CONSTRAINT "Assignment_dueAt_check" CHECK ("publishedAt" IS NULL OR "dueAt" IS NULL OR "dueAt" > "publishedAt");

ALTER TABLE "AssignmentQuestion"
ADD CONSTRAINT "AssignmentQuestion_points_check" CHECK ("points" > 0),
ADD CONSTRAINT "AssignmentQuestion_answer_shape_check" CHECK (
  ("typeSnapshot" IN ('SINGLE_CHOICE', 'MULTIPLE_CHOICE') AND "correctBooleanSnapshot" IS NULL AND "referenceAnswerSnapshot" IS NULL AND cardinality("acceptableAnswersSnapshot") = 0)
  OR ("typeSnapshot" = 'TRUE_FALSE' AND "correctBooleanSnapshot" IS NOT NULL AND "referenceAnswerSnapshot" IS NULL AND cardinality("acceptableAnswersSnapshot") = 0)
  OR ("typeSnapshot" = 'FILL_BLANK' AND "correctBooleanSnapshot" IS NULL AND "referenceAnswerSnapshot" IS NULL AND cardinality("acceptableAnswersSnapshot") > 0)
  OR ("typeSnapshot" = 'SHORT_ANSWER' AND "correctBooleanSnapshot" IS NULL AND "referenceAnswerSnapshot" IS NOT NULL AND cardinality("acceptableAnswersSnapshot") = 0)
);

ALTER TABLE "Submission"
ADD CONSTRAINT "Submission_attemptNumber_check" CHECK ("attemptNumber" > 0),
ADD CONSTRAINT "Submission_score_check" CHECK (
  ("score" IS NULL AND "maxScore" IS NULL AND "percentage" IS NULL)
  OR (
    "score" IS NOT NULL
    AND "maxScore" IS NOT NULL
    AND "percentage" IS NOT NULL
    AND "score" >= 0
    AND "maxScore" >= 0
    AND "score" <= "maxScore"
    AND "percentage" BETWEEN 0 AND 100
  )
),
ADD CONSTRAINT "Submission_timestamps_check" CHECK (
  ("submittedAt" IS NULL OR "submittedAt" >= "startedAt")
  AND ("gradedAt" IS NULL OR "submittedAt" IS NULL OR "gradedAt" >= "submittedAt")
  AND ("publishedAt" IS NULL OR "gradedAt" IS NULL OR "publishedAt" >= "gradedAt")
);

ALTER TABLE "StudentAnswer"
ADD CONSTRAINT "StudentAnswer_score_check" CHECK (
  "maxScore" >= 0
  AND ("score" IS NULL OR ("score" >= 0 AND "score" <= "maxScore"))
);

ALTER TABLE "WrongQuestion"
ADD CONSTRAINT "WrongQuestion_reviewCount_check" CHECK ("reviewCount" >= 0);

ALTER TABLE "StudentKnowledgeMastery"
ADD CONSTRAINT "StudentKnowledgeMastery_values_check" CHECK (
  "masteryScore" BETWEEN 0 AND 100
  AND "earnedPoints" >= 0
  AND "availablePoints" >= 0
  AND "earnedPoints" <= "availablePoints"
  AND "answeredCount" >= 0
  AND "correctCount" >= 0
  AND "correctCount" <= "answeredCount"
);

ALTER TABLE "AIAnalysis"
ADD CONSTRAINT "AIAnalysis_target_check" CHECK (
  ("scope" = 'STUDENT' AND "studentId" IS NOT NULL AND "classroomId" IS NULL)
  OR ("scope" = 'CLASSROOM' AND "studentId" IS NULL AND "classroomId" IS NOT NULL)
),
ADD CONSTRAINT "AIAnalysis_values_check" CHECK (
  "sampleSize" >= 0
  AND "retryCount" BETWEEN 0 AND 1
  AND ("overallScore" IS NULL OR "overallScore" BETWEEN 0 AND 100)
);

ALTER TABLE "AIAnalysisInsight"
ADD CONSTRAINT "AIAnalysisInsight_priority_check" CHECK ("priority" >= 0);

ALTER TABLE "PersonalizedRecommendation"
ADD CONSTRAINT "PersonalizedRecommendation_values_check" CHECK (
  "priority" >= 0
  AND ("score" IS NULL OR "score" >= 0)
  AND ("maxScore" IS NULL OR "maxScore" >= 0)
  AND ("score" IS NULL OR "maxScore" IS NULL OR "score" <= "maxScore")
);

ALTER TABLE "AITutoringRecord"
ADD CONSTRAINT "AITutoringRecord_values_check" CHECK (
  "retryCount" BETWEEN 0 AND 1
  AND ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
  AND ("promptTokens" IS NULL OR "promptTokens" >= 0)
  AND ("completionTokens" IS NULL OR "completionTokens" >= 0)
  AND ("latencyMs" IS NULL OR "latencyMs" >= 0)
);
