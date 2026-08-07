import { Role } from "@prisma/client";

import { apiError } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { exportTeacherGradeTemplate } from "@/services/gradebook/grade-import-service";
import { gradebookIdSchema } from "@/services/gradebook/schemas";

interface RouteContext {
  params: Promise<{ gradebookId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const id = gradebookIdSchema.safeParse((await context.params).gradebookId);
  if (!id.success) return apiError("成绩台账 ID 格式无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const result = await exportTeacherGradeTemplate(
      teacher.id,
      id.data,
      auditRequestContext(request),
    );
    return new Response(new Uint8Array(result.data), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
