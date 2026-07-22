import { apiError } from "@/lib/api-response";
import {
  getAdminUserErrorStatus,
  getAdminUserSafeErrorMessage,
} from "@/services/admin/users/errors";

export function adminUserApiError(error: unknown) {
  const status = getAdminUserErrorStatus(error);
  if (status === 500) console.error("Admin user API request failed", error);
  return apiError(getAdminUserSafeErrorMessage(error), status);
}
