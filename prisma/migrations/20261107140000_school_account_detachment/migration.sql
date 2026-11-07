-- Permit detached administrator records to remain inactive after their school
-- relationship is removed. Active administrators still require a school.
ALTER TABLE "User" DROP CONSTRAINT "User_admin_school_required";

ALTER TABLE "User"
ADD CONSTRAINT "User_admin_school_required"
CHECK ("role" <> 'ADMIN' OR "schoolId" IS NOT NULL OR "status" = 'INACTIVE');

-- Rollback requires rebinding every detached inactive administrator to a school
-- before restoring the original constraint.
