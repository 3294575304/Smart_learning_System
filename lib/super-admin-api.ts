import { revalidatePath } from "next/cache";
import { apiError } from "@/lib/api-response";
import {
  getErrorStatus,
  getSafeErrorMessage,
} from "@/services/auth/authorization";
import { ProvisioningError } from "@/services/super-admin/provisioning-errors";

export function provisioningApiError(error: unknown) {
  if (error instanceof ProvisioningError)
    return apiError(error.message, error.status);
  const status = getErrorStatus(error);
  if (status >= 500)
    console.error(
      "School provisioning request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
  return apiError(getSafeErrorMessage(error), status);
}

export function refreshSuperAdminPages() {
  revalidatePath("/super-admin", "layout");
}
