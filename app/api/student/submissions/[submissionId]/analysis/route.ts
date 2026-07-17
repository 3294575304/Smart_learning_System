import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import {
  getAIAnalysisErrorStatus,
  getAIAnalysisSafeErrorMessage,
} from "@/services/ai/errors";
import {
  createStudentAnalysis,
  getStudentAnalysis,
} from "@/services/ai/service";
import { learningAnalysisMetadataHeaders } from "@/services/ai/metadata";
import { submissionIdSchema } from "@/services/assignments/schemas";

interface Context {
  params: Promise<{ submissionId: string }>;
}

function invalidIdResponse() {
  return apiError("提交 ID 格式无效", 400);
}

function analysisErrorResponse(error: unknown) {
  const status = getAIAnalysisErrorStatus(error);
  if (status === 500) console.error("AI analysis request failed", error);
  return apiError(getAIAnalysisSafeErrorMessage(error), status);
}

export async function GET(_request: Request, context: Context) {
  const id = submissionIdSchema.safeParse((await context.params).submissionId);
  if (!id.success) return invalidIdResponse();
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const result = await getStudentAnalysis(student.id, id.data);
    return apiSuccess(
      result.analysis,
      200,
      learningAnalysisMetadataHeaders(result.metadata),
    );
  } catch (error: unknown) {
    return analysisErrorResponse(error);
  }
}

export async function POST(_request: Request, context: Context) {
  const id = submissionIdSchema.safeParse((await context.params).submissionId);
  if (!id.success) return invalidIdResponse();
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const result = await createStudentAnalysis(student.id, id.data);
    return apiSuccess(
      result.analysis,
      200,
      learningAnalysisMetadataHeaders(result.metadata),
    );
  } catch (error: unknown) {
    return analysisErrorResponse(error);
  }
}
