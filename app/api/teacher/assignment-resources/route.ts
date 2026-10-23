import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { uploadAssignmentResource } from "@/services/assignments/resources";

export async function POST(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    if (Number(request.headers.get("content-length") ?? 0) > 6 * 1024 * 1024)
      return apiError("单个文件不能超过5MB", 400);
    const data = await request.formData();
    const courseId = z.string().cuid().safeParse(data.get("courseId"));
    const file = data.get("file");
    if (!courseId.success || !(file instanceof File))
      return apiError("请选择所属课程和文件", 400);
    return apiSuccess(
      await uploadAssignmentResource(
        teacher.id,
        courseId.data,
        file,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
