-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('SCHEDULED', 'OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PENDING', 'PRESENT', 'LATE', 'EARLY_LEAVE', 'LEAVE', 'ABSENT');

-- CreateEnum
CREATE TYPE "AttendanceRecordSource" AS ENUM ('SYSTEM', 'STUDENT_SIGN_IN', 'TEACHER_CORRECTION');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_SESSION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_SESSION_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_SIGNED';
ALTER TYPE "AuditAction" ADD VALUE 'ATTENDANCE_CORRECTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditTargetType" ADD VALUE 'ATTENDANCE_SESSION';
ALTER TYPE "AuditTargetType" ADD VALUE 'ATTENDANCE_RECORD';

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "classroomId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "status" "AttendanceSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "signInOpensAt" TIMESTAMP(3) NOT NULL,
    "lateAfter" TIMESTAMP(3) NOT NULL,
    "signInClosesAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentStatus" "AttendanceStatus" NOT NULL DEFAULT 'PENDING',
    "currentRevisionNumber" INTEGER NOT NULL DEFAULT 0,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecordRevision" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "previousStatus" "AttendanceStatus" NOT NULL,
    "newStatus" "AttendanceStatus" NOT NULL,
    "source" "AttendanceRecordSource" NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecordRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceSession_courseId_status_startsAt_idx" ON "AttendanceSession"("courseId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_classroomId_status_startsAt_idx" ON "AttendanceSession"("classroomId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "AttendanceSession_teacherId_createdAt_idx" ON "AttendanceSession"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_studentId_createdAt_idx" ON "AttendanceRecord"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "AttendanceRecord_sessionId_currentStatus_idx" ON "AttendanceRecord"("sessionId", "currentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_sessionId_studentId_key" ON "AttendanceRecord"("sessionId", "studentId");

-- CreateIndex
CREATE INDEX "AttendanceRecordRevision_actorId_occurredAt_idx" ON "AttendanceRecordRevision"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "AttendanceRecordRevision_newStatus_occurredAt_idx" ON "AttendanceRecordRevision"("newStatus", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecordRevision_recordId_revisionNumber_key" ON "AttendanceRecordRevision"("recordId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecordRevision" ADD CONSTRAINT "AttendanceRecordRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "AttendanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecordRevision" ADD CONSTRAINT "AttendanceRecordRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AttendanceSession"
  ADD CONSTRAINT "AttendanceSession_window_check"
  CHECK ("signInOpensAt" <= "startsAt" AND "startsAt" <= "lateAfter" AND "lateAfter" <= "signInClosesAt"),
  ADD CONSTRAINT "AttendanceSession_revision_check" CHECK ("revision" >= 0);

ALTER TABLE "AttendanceRecord"
  ADD CONSTRAINT "AttendanceRecord_revision_check" CHECK ("currentRevisionNumber" >= 0);

ALTER TABLE "AttendanceRecordRevision"
  ADD CONSTRAINT "AttendanceRecordRevision_number_check" CHECK ("revisionNumber" > 0),
  ADD CONSTRAINT "AttendanceRecordRevision_reason_check"
  CHECK ("source" <> 'TEACHER_CORRECTION' OR ("reason" IS NOT NULL AND length(btrim("reason")) > 0));
