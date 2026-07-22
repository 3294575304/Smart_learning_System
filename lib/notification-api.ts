import { apiError } from "@/lib/api-response";
import {
  getErrorStatus,
  getSafeErrorMessage,
} from "@/services/auth/authorization";
import { NotificationOperationError } from "@/services/notifications/errors";

export function notificationApiError(error: unknown) {
  if (error instanceof NotificationOperationError) {
    return apiError(error.message, error.status);
  }
  const status = getErrorStatus(error);
  if (status === 500) console.error("Notification API request failed");
  return apiError(getSafeErrorMessage(error), status);
}
