import { Role } from "@prisma/client";

import { apiError } from "@/lib/api-response";
import { encodedAttachmentDisposition } from "@/lib/content-disposition";
import { courseFileApiError } from "@/lib/course-file-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseFileIdSchema } from "@/services/course-files/schemas";
import { downloadAdminCourseFileVersion } from "@/services/course-files/service";

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
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const { file, data } = await downloadAdminCourseFileVersion(
      admin.id,
      parsedId.data,
      auditRequestContext(request),
    );

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "content-type": file.mimeType,
        "content-disposition": encodedAttachmentDisposition(
          file.originalFileName,
          "course-file",
        ),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error: unknown) {
    return courseFileApiError(error);
  }
}
