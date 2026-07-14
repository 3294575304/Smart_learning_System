import {
  getErrorStatus,
  getSafeErrorMessage,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    return apiSuccess({ user });
  } catch (error: unknown) {
    return apiError(getSafeErrorMessage(error), getErrorStatus(error));
  }
}
