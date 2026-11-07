import { Role } from "@prisma/client";
import { z } from "zod";

import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { scheduleBackgroundWorkerWakeup } from "@/services/background-jobs/wakeup";
import {
  createPaperDraft,
  listPaperDrafts,
} from "@/services/exams/paper-drafts";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(await listPaperDrafts(teacher.id), 200, {
      "Cache-Control": "private, no-store",
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const form = await request.formData().catch(() => null);
    const courseId = z.string().cuid().safeParse(form?.get("courseId"));
    const file = form?.get("file");
    if (!courseId.success || !(file instanceof File))
      return apiError("请选择本人课程和试卷文件", 400);
    if (form?.get("confirmedBlank") !== "true")
      return apiError("请先确认试卷不含学生个人信息", 400);
    const draft = await createPaperDraft(
      teacher.id,
      courseId.data,
      file,
      auditRequestContext(request),
    );
    scheduleBackgroundWorkerWakeup();
    return apiSuccess(draft, 202);
  } catch (error) {
    return assignmentApiError(error);
  }
}
