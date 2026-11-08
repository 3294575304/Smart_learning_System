import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  examAnalysisThresholdsSchema,
  generateTeacherExamAnalysis,
} from "@/services/exams/analysis";

export async function POST(
  request: Request,
  context: { params: Promise<{ examId: string }> },
) {
  const id = z
    .string()
    .cuid()
    .safeParse((await context.params).examId);
  if (!id.success) return apiError("考试 ID 无效", 400);
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return apiError("请求内容不是有效 JSON", 400);
  }
  const thresholds = examAnalysisThresholdsSchema.safeParse(input);
  if (!thresholds.success) return apiError("及格线或优秀线无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const record = await generateTeacherExamAnalysis(
      teacher.id,
      id.data,
      thresholds.data,
      auditRequestContext(request),
    );
    return apiSuccess({ revision: record.revision });
  } catch (error) {
    return assignmentApiError(error);
  }
}
