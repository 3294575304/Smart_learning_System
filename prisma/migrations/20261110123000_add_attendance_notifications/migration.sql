-- Additive enum values; existing notification rows keep their original meaning.
ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_PUBLISHED';
ALTER TYPE "NotificationSourceType" ADD VALUE 'ATTENDANCE_SESSION';
