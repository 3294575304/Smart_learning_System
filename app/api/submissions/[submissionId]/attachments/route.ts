import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";
import {
  listSubmissionAttachments,
  uploadSubmissionAttachment,
} from "@/services/assignments/attachments";

type Context = { params: Promise<{ submissionId: string }> };
const pathSchema = z.object({ submissionId: z.string().cuid() });
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT, Role.TEACHER]);
    const path = pathSchema.safeParse(await context.params);
    if (!path.success) return apiError("作答 ID 无效", 400);
    return apiSuccess(
      await listSubmissionAttachments(actor, path.data.submissionId),
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireAuthenticatedUser([Role.STUDENT]);
    const path = pathSchema.safeParse(await context.params);
    if (!path.success) return apiError("作答 ID 无效", 400);
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
      return apiError("附件请求过大", 413);
    const reader = request.body?.getReader();
    if (!reader) return apiError("缺少附件内容", 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 6 * 1024 * 1024) {
        await reader.cancel();
        return apiError("附件请求过大", 413);
      }
      chunks.push(value);
    }
    const form = await new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const question = z
      .string()
      .cuid()
      .safeParse(form.get("assignmentQuestionId"));
    const file = form.get("file");
    if (!question.success || !(file instanceof File))
      return apiError("请选择题目与附件", 400);
    return apiSuccess(
      await uploadSubmissionAttachment(
        actor,
        path.data.submissionId,
        question.data,
        file,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error) {
    return assignmentApiError(error);
  }
}
