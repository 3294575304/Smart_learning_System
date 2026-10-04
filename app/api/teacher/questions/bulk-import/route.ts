import { QuestionType, Role } from "@prisma/client";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { questionUpsertSchema } from "@/services/questions/schemas";
import {
  createQuestionsInBulk,
  listKnowledgePointOptions,
} from "@/services/questions/service";

const payloadSchema = z.object({
  knowledgePointIds: z.array(z.string().cuid()).min(1).max(10),
  questions: z.array(z.unknown()).min(1).max(100),
});

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) return apiError("请检查导入数据及默认知识点", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const knowledgePoints = await listKnowledgePointOptions();
    const activeIds = new Set(knowledgePoints.map((item) => item.id));
    if (parsed.data.knowledgePointIds.some((id) => !activeIds.has(id)))
      return apiError("所选公共知识点不存在或已停用，请刷新后重试", 400);
    const questions = [];
    for (const [index, item] of parsed.data.questions.entries()) {
      const result = questionUpsertSchema.safeParse({
        ...(item && typeof item === "object" && !Array.isArray(item)
          ? item
          : {}),
        knowledgePointIds: parsed.data.knowledgePointIds,
        visibility: "PRIVATE",
      });
      if (!result.success)
        return apiError(
          `第 ${index + 1} 道题格式不正确：${result.error.issues[0]?.message ?? "请检查字段"}`,
          400,
        );
      questions.push(result.data);
    }
    if (questions.some((item) => item.type === QuestionType.PYTHON_PROGRAMMING))
      return apiError(
        "批量导入暂不支持 Python 编程题；请在题目编辑页配置判题用例后创建。",
        400,
      );
    const ids = await createQuestionsInBulk(teacher.id, questions);
    return apiSuccess({ createdCount: ids.length, questionIds: ids }, 201);
  } catch (error: unknown) {
    return questionApiError(error);
  }
}
