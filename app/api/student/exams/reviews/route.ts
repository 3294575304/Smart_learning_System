import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { examReviewRequest } from "@/services/exams/result-schemas";
import { requestExamScoreReview } from "@/services/exams/score-reviews";

export async function POST(request: Request) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    const parsed = examReviewRequest.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return apiError("请填写 2 至 1000 字的复核原因", 400);
    const { submissionId, reason } = parsed.data;
    return apiSuccess(
      await requestExamScoreReview(
        student.id,
        submissionId,
        reason,
        auditRequestContext(request),
      ),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
