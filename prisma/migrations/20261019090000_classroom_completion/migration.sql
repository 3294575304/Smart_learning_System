-- Additive migration: existing ACTIVE/CLOSED/ARCHIVED records retain their meaning.
ALTER TYPE "ClassroomStatus" ADD VALUE 'COMPLETED';
ALTER TYPE "AuditAction" ADD VALUE 'CLASSROOM_COMPLETED';
ALTER TABLE "Classroom" ADD COLUMN "completedAt" TIMESTAMP(3), ADD COLUMN "closureReason" TEXT;
