import { Role } from "@prisma/client";
import { apiError } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { encodedAttachmentDisposition } from "@/lib/content-disposition";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import { readAssignmentResource } from "@/services/assignments/resources";
import { assignmentIdSchema } from "@/services/assignments/schemas";

export async function GET(
  request: Request,
  context: { params: Promise<{ assignmentId: string; fileId: string }> },
) {
  try {
    const actor = await requireAuthenticatedUser([Role.TEACHER, Role.STUDENT]);
    const ids = await context.params;
    if (
      !assignmentIdSchema.safeParse(ids.assignmentId).success ||
      !assignmentIdSchema.safeParse(ids.fileId).success
    )
      return apiError("附件参数无效", 400);
    const { file, data } = await readAssignmentResource(
      actor,
      ids.assignmentId,
      ids.fileId,
      auditRequestContext(request),
    );
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": file.mimeType,
        "content-disposition": encodedAttachmentDisposition(
          file.originalFileName,
        ),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}
