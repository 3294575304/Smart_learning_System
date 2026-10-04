import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { QuestionImportError } from "@/services/question-import/errors";
import { previewTeacherQuestionImport } from "@/services/question-import/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const formData = await request.formData().catch(() => null);
    const file = formData?.get("file");
    if (!(file instanceof File))
      return apiError("请选择要导入的题库文件。", 400);
    return apiSuccess(await previewTeacherQuestionImport(teacher.id, file));
  } catch (error: unknown) {
    if (error instanceof QuestionImportError) {
      return apiError(error.message, error.status, undefined, error.code);
    }
    return questionApiError(error);
  }
}
