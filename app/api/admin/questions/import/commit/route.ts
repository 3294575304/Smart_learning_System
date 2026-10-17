import { Role } from "@prisma/client";

import { adminGovernanceApiError } from "@/lib/admin-governance-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { QuestionImportError } from "@/services/question-import/errors";
import { questionImportCommitSchema } from "@/services/question-import/schemas";
import { commitAdminQuestionImport } from "@/services/question-import/service";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = questionImportCommitSchema.safeParse(body);
  if (!parsed.success) return apiError("请检查导入题目、答案及知识点。", 400);
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const result = await commitAdminQuestionImport(
      admin.id,
      parsed.data,
      auditRequestContext(request),
    );
    return apiSuccess(result, 201);
  } catch (error: unknown) {
    if (error instanceof QuestionImportError) {
      return apiError(error.message, error.status, undefined, error.code);
    }
    return adminGovernanceApiError(error);
  }
}
