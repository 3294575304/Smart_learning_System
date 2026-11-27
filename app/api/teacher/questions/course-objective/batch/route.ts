import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { appendQuestionCourseObjectiveBatch } from "@/services/question-objectives/editing";
import { questionIdSchema } from "@/services/questions/schemas";

const inputSchema = z
  .object({
    courseId: z.string().cuid(),
    syllabusStructureId: z.string().cuid(),
    objectiveCode: z.string().trim().min(1).max(50),
    questionIds: z
      .array(questionIdSchema)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success)
      return apiError("请选择一个课程目标和 1–20 道不同的题目", 400);
    return apiSuccess(
      await appendQuestionCourseObjectiveBatch(
        teacher.id,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    if (error instanceof AssignmentOperationError)
      return apiError(error.message, error.status);
    return questionApiError(error);
  }
}
