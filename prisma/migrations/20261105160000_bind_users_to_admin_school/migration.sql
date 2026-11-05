-- This deployment has one institution administrator. Existing teacher and
-- student accounts are assigned to that administrator's current school.
WITH "current_admin_school" AS (
    SELECT "schoolId"
    FROM "User"
    WHERE "role" = 'ADMIN' AND "schoolId" IS NOT NULL
    ORDER BY "createdAt", "id"
    LIMIT 1
)
UPDATE "User" AS account
SET "schoolId" = current_admin_school."schoolId"
FROM "current_admin_school"
WHERE account."role" IN ('TEACHER', 'STUDENT');

-- Rollback: UPDATE "User" SET "schoolId" = NULL WHERE "role" IN ('TEACHER', 'STUDENT');
