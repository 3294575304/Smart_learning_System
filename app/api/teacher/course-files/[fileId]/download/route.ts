import { Role } from "@prisma/client";

import { apiError } from "@/lib/api-response";
import { encodedAttachmentDisposition } from "@/lib/content-disposition";
import { courseFileApiError } from "@/lib/course-file-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseFileIdSchema } from "@/services/course-files/schemas";
import { downloadTeacherCourseFileVersion } from "@/services/course-files/service";

interface RouteContext {
  params: Promise<{ fileId: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const parsedId = courseFileIdSchema.safeParse(fileId);
  if (!parsedId.success) {
    return apiError("文件 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const { file, data } = await downloadTeacherCourseFileVersion(
      teacher.id,
      parsedId.data,
      auditRequestContext(request),
    );

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "content-type": file.mimeType,
        "content-disposition": encodedAttachmentDisposition(
          file.originalFileName,
          "student-roster",
        ),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: unknown) {
    return courseFileApiError(error);
  }
}
