ALTER TYPE "AuditAction" ADD VALUE 'COURSE_ROSTER_UPDATED';
ALTER TABLE "StudentIdentityClassroomAssignment" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
