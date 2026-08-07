import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { gradebookApiError } from "@/lib/gradebook-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  correctGradeEntrySchema,
  gradebookIdSchema,
  gradeItemIdSchema,
  studentIdSchema,
} from "@/services/gradebook/schemas";
import { correctTeacherGradeEntry } from "@/services/gradebook/service";

interface RouteContext {
  params: Promise<{
    gradebookId: string;
    gradeItemId: string;
    studentId: string;
  }>;
}

export async function PUT(request: Request, context: RouteContext) {
  const params = await context.params;
  const gradebookId = gradebookIdSchema.safeParse(params.gradebookId);
  const gradeItemId = gradeItemIdSchema.safeParse(params.gradeItemId);
  const studentId = studentIdSchema.safeParse(params.studentId);
  if (!gradebookId.success || !gradeItemId.success || !studentId.success) {
    return apiError("成绩台账、成绩项或学生 ID 格式无效", 400);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("请求内容必须是合法 JSON", 400);
  }
  const input = correctGradeEntrySchema.safeParse(body);
  if (!input.success) {
    return apiError("成绩参数无效", 400, input.error.flatten().fieldErrors);
  }
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await correctTeacherGradeEntry(
        teacher.id,
        gradebookId.data,
        gradeItemId.data,
        studentId.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return gradebookApiError(error);
  }
}
