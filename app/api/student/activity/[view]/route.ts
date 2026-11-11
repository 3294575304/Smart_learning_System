import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getErrorStatus, getSafeErrorMessage } from "@/services/auth/policy";
import {
  activityQuerySchema,
  activityViews,
} from "@/services/student-experience/activity-query";
import { listStudentActivity } from "@/services/student-experience/activity-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ view: string }> },
) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const view = z.enum(activityViews).safeParse((await context.params).view);
    if (!view.success)
      return apiError("列表不存在。", 404, undefined, "NOT_FOUND");

    const search = new URL(request.url).searchParams;
    const raw = Object.fromEntries(
      [...new Set(search.keys())].map((key) => {
        const values = search.getAll(key);
        return [key, values.length === 1 ? values[0] : values];
      }),
    );
    const query = activityQuerySchema(view.data).safeParse(raw);
    if (!query.success)
      return apiError(
        "筛选参数无效。",
        400,
        query.error.flatten().fieldErrors,
        "INVALID_FILTERS",
      );

    const data = await listStudentActivity(view.data, student.id, query.data);
    return apiSuccess({ ...data, filters: query.data }, 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 500) console.error("Student activity list failed", error);
    const code =
      status === 401
        ? "UNAUTHENTICATED"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : status === 503
              ? "SYSTEM_MAINTENANCE"
              : "INTERNAL_ERROR";
    return apiError(getSafeErrorMessage(error), status, undefined, code);
  }
}
