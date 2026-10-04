import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  deleteSubmissionAttachment,
  readSubmissionAttachment,
} from "@/services/assignments/attachments";

type Context = {
  params: Promise<{ submissionId: string; attachmentId: string }>;
};
const pathSchema = z.object({
  submissionId: z.string().cuid(),
  attachmentId: z.string().cuid(),
});
export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT, Role.TEACHER]);
    const path = pathSchema.safeParse(await context.params);
    if (!path.success) return apiError("附件 ID 无效", 400);
    const { file, data } = await readSubmissionAttachment(
      actor,
      path.data.submissionId,
      path.data.attachmentId,
      auditRequestContext(request),
    );
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": file.mimeType,
        "content-length": String(data.length),
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT]);
    const path = pathSchema.safeParse(await context.params);
    if (!path.success) return apiError("附件 ID 无效", 400);
    await deleteSubmissionAttachment(
      actor,
      path.data.submissionId,
      path.data.attachmentId,
      auditRequestContext(request),
    );
    return apiSuccess({ deleted: true });
  } catch (error) {
    return assignmentApiError(error);
  }
}
