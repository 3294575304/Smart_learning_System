import { apiError, apiSuccess } from "@/lib/api-response";
import { definedFieldErrors } from "@/lib/zod-errors";
import {
  getErrorStatus,
  getSafeErrorMessage,
  requireAuthenticatedUser,
} from "@/services/auth/authorization";
import {
  changeInitialPassword,
  ChangeInitialPasswordError,
} from "@/services/auth/change-password";
import { changeInitialPasswordSchema } from "@/services/auth/schemas";
import { createSession } from "@/services/auth/session";
import { roleHomePath } from "@/services/auth/policy";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = changeInitialPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      "请检查密码信息",
      400,
      definedFieldErrors(parsed.error.flatten().fieldErrors),
    );
  }

  try {
    const user = await requireAuthenticatedUser(undefined, {
      allowInitialPasswordChange: true,
    });
    const result = await changeInitialPassword(user.id, parsed.data);
    if (result.changed) {
      await createSession(user.id);
    }
    return apiSuccess({ redirectTo: roleHomePath(result.role) });
  } catch (error: unknown) {
    if (error instanceof ChangeInitialPasswordError) {
      return apiError(error.message, 400, error.fieldErrors);
    }
    return apiError(getSafeErrorMessage(error), getErrorStatus(error));
  }
}
