import { apiError } from "@/lib/api-response";
import { AnnouncementOperationError } from "@/services/announcements/errors";
import {
  getErrorStatus,
  getSafeErrorMessage,
} from "@/services/auth/authorization";

export function announcementApiError(error: unknown) {
  if (error instanceof AnnouncementOperationError) {
    return apiError(error.message, error.status);
  }
  const status = getErrorStatus(error);
  if (status === 500) console.error("Announcement API request failed");
  return apiError(getSafeErrorMessage(error), status);
}
