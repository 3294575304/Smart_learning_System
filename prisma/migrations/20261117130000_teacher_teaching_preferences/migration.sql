ALTER TABLE "User"
    ADD COLUMN "teacherAssignmentDueDays" INTEGER,
    ADD COLUMN "teacherAssignmentAllowResubmission" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "teacherNotifyQualityReportReady" BOOLEAN NOT NULL DEFAULT true,
    ADD CONSTRAINT "User_teacherAssignmentDueDays_check"
        CHECK ("teacherAssignmentDueDays" BETWEEN 1 AND 365);
