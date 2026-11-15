import { Role } from "@prisma/client";
import { apiError, apiSuccess } from "@/lib/api-response";
import { recommendationApiError } from "@/lib/recommendation-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import { hasActiveExamAttempt } from "@/services/exams/assistant-policy";
import { isStudyAssistantPilotStudent } from "@/services/student-assistant/pilot";
import {
  findStudyDestination,
  studyAssistantInput,
  todayStudyTasks,
} from "@/services/student-assistant/rules";

const privateResponse = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    return apiSuccess(
      { blocked: await hasActiveExamAttempt(student.id) },
      200,
      privateResponse,
    );
  } catch (error) {
    return recommendationApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    if (!isStudyAssistantPilotStudent(student.id))
      return apiError("学习助手暂未开放。", 404);
    const input = studyAssistantInput.safeParse(
      await request.json().catch(() => null),
    );
    if (!input.success)
      return apiError("请选择操作或输入 1–120 字的功能名称。", 400);
    const now = new Date();
    if (await hasActiveExamAttempt(student.id, now))
      return apiError(
        "考试作答期间，学习助手暂不可用。",
        403,
        undefined,
        "EXAM_IN_PROGRESS",
      );
    if (input.data.action === "find")
      return apiSuccess(
        findStudyDestination(input.data.text),
        200,
        privateResponse,
      );
    const overview = await getStudentTaskOverview(student.id, now);
    if (await hasActiveExamAttempt(student.id))
      return apiError(
        "考试作答期间，学习助手暂不可用。",
        403,
        undefined,
        "EXAM_IN_PROGRESS",
      );
    return apiSuccess(todayStudyTasks(overview, now), 200, privateResponse);
  } catch (error) {
    return recommendationApiError(error);
  }
}
