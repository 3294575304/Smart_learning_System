import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { QuestionImportError } from "@/services/question-import/errors";
import { questionImportCommitSchema } from "@/services/question-import/schemas";
import { commitTeacherQuestionImport } from "@/services/question-import/service";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = questionImportCommitSchema.safeParse(body);
  if (!parsed.success) return apiError("请检查导入题目、答案及知识点。", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const result = await commitTeacherQuestionImport(
      teacher.id,
      parsed.data,
      auditRequestContext(request),
    );
    return apiSuccess(result, 201);
  } catch (error: unknown) {
    if (error instanceof QuestionImportError) {
      return apiError(error.message, error.status, undefined, error.code);
    }
    return questionApiError(error);
  }
}
