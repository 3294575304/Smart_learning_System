import { Role } from "@prisma/client";
import { z } from "zod";
import { assignmentApiError } from "@/lib/assignment-api";
import { apiError } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { readPaperDraftSource } from "@/services/exams/paper-drafts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ draftId: string }> },
) {
  const id = z
    .string()
    .cuid()
    .safeParse((await context.params).draftId);
  if (!id.success) return apiError("草稿 ID 无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const source = await readPaperDraftSource(teacher.id, id.data);
    return new Response(new Uint8Array(source.bytes), {
      headers: {
        "Content-Type": source.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(source.fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}
