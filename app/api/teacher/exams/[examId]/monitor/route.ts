import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getExamMonitor } from "@/services/exams/monitor";
import {
  examMonitorScope,
  examResultManagementAction,
} from "@/services/exams/result-schemas";
import {
  findExamClassAssignment,
  setExamResultPublication,
} from "@/services/exams/result-management";
import { resolveExamScoreReview } from "@/services/exams/score-reviews";
import { auditRequestContext } from "@/services/audit/request-context";

type Context = { params: Promise<{ examId: string }> };
async function readScope(request: Request, { params }: Context) {
  const query = new URL(request.url).searchParams;
  return query.getAll("classroomId").length === 1
    ? examMonitorScope.safeParse({
        ...(await params),
        classroomId: query.get("classroomId"),
      }).data
    : undefined;
}
export async function GET(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const scope = await readScope(request, context);
    if (!scope) return apiError("考试或教学班参数无效", 400);
    return apiSuccess(
      await getExamMonitor(teacher.id, scope.examId, scope.classroomId),
      200,
      { "Cache-Control": "private, no-store" },
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const [scope, action] = await Promise.all([
      readScope(request, context),
      request
        .json()
        .catch(() => null)
        .then((input: unknown) => examResultManagementAction.safeParse(input)),
    ]);
    if (!scope || !action.success)
      return apiError("考试、公布设置或复核内容无效", 400);
    const assignmentId = await findExamClassAssignment(teacher.id, scope);
    const audit = auditRequestContext(request);
    return action.data.action === "POLICY"
      ? apiSuccess(
          await setExamResultPublication(
            teacher.id,
            assignmentId,
            action.data.policy,
            audit,
          ),
        )
      : apiSuccess(
          await resolveExamScoreReview(
            teacher.id,
            assignmentId,
            action.data.reviewId,
            action.data.response,
            audit,
          ),
        );
  } catch (error) {
    return assignmentApiError(error);
  }
}
