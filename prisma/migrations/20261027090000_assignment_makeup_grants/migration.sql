-- CreateEnum
CREATE TYPE "MakeupGrantKind" AS ENUM ('MAKEUP', 'REDO');

-- CreateEnum
CREATE TYPE "MakeupGrantStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ASSIGNMENT_DEADLINE_EXTENDED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSIGNMENT_MAKEUP_GRANTED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSIGNMENT_MAKEUP_REVOKED';

-- CreateTable
CREATE TABLE "AssignmentMakeupGrant" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "requestId" UUID NOT NULL,
    "kind" "MakeupGrantKind" NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "requestedExpiresAt" TIMESTAMP(3) NOT NULL,
    "originalDueAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "MakeupGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "submissionId" TEXT,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentMakeupGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssignmentMakeupGrant_assignmentId_status_expiresAt_idx" ON "AssignmentMakeupGrant"("assignmentId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AssignmentMakeupGrant_studentId_status_expiresAt_idx" ON "AssignmentMakeupGrant"("studentId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "AssignmentMakeupGrant_submissionId_idx" ON "AssignmentMakeupGrant"("submissionId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentMakeupGrant_assignmentId_studentId_requestId_key" ON "AssignmentMakeupGrant"("assignmentId", "studentId", "requestId");

-- AddForeignKey
ALTER TABLE "AssignmentMakeupGrant" ADD CONSTRAINT "AssignmentMakeupGrant_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentMakeupGrant" ADD CONSTRAINT "AssignmentMakeupGrant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentMakeupGrant" ADD CONSTRAINT "AssignmentMakeupGrant_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentMakeupGrant" ADD CONSTRAINT "AssignmentMakeupGrant_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A revoked/expired grant remains as history; only one live authorization per student/task.
CREATE UNIQUE INDEX "AssignmentMakeupGrant_one_active" ON "AssignmentMakeupGrant" ("assignmentId", "studentId") WHERE status = 'ACTIVE';
ALTER TABLE "AssignmentMakeupGrant" ADD CONSTRAINT "AssignmentMakeupGrant_dates_check" CHECK ("expiresAt" >= "requestedExpiresAt" AND "requestedExpiresAt" > "originalDueAt");
ALTER TABLE "AssignmentMakeupGrant" ADD CONSTRAINT "AssignmentMakeupGrant_consumption_check" CHECK ((status = 'USED' AND "usedAt" IS NOT NULL AND "submissionId" IS NOT NULL) OR (status <> 'USED' AND "usedAt" IS NULL));
ALTER TABLE "AssignmentMakeupGrant" ADD CONSTRAINT "AssignmentMakeupGrant_revoke_check" CHECK ((status = 'REVOKED' AND "revokedAt" IS NOT NULL) OR (status <> 'REVOKED' AND "revokedAt" IS NULL));
