import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { questionApiError } from "@/lib/question-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { saveQuestionCourseObjective } from "@/services/question-objectives/editing";
import { questionIdSchema } from "@/services/questions/schemas";

const objectiveCode = z.string().trim().min(1).max(50);
const objectiveCodes = z
  .array(objectiveCode)
  .max(3)
  .refine((codes) => new Set(codes).size === codes.length);
const scope = z.object({
  courseId: z.string().cuid(),
  syllabusStructureId: z.string().cuid(),
});
const inputSchema = z.union([
  scope
    .extend({ objectiveCodes, expectedObjectiveCodes: objectiveCodes })
    .strict(),
  scope
    .extend({ objectiveCode, expectedObjectiveCode: objectiveCode.nullable() })
    .strict(),
]);

export async function PUT(
  request: Request,
  context: { params: Promise<{ questionId: string }> },
) {
  const questionId = questionIdSchema.safeParse(
    (await context.params).questionId,
  );
  const input = inputSchema.safeParse(await request.json().catch(() => null));
  if (!questionId.success || !input.success)
    return apiError("课程目标参数无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await saveQuestionCourseObjective(
        teacher.id,
        questionId.data,
        input.data,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return questionApiError(error);
  }
}
