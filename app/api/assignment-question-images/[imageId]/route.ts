import { Role } from "@prisma/client";
import { z } from "zod";
import { apiError } from "@/lib/api-response";
import { assignmentApiError } from "@/lib/assignment-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { readAssignmentQuestionImage } from "@/services/exams/paper-images";

export async function GET(
  _request: Request,
  context: { params: Promise<{ imageId: string }> },
) {
  const id = z
    .string()
    .cuid()
    .safeParse((await context.params).imageId);
  if (!id.success) return apiError("图片 ID 无效", 400);
  try {
    const actor = await requireAuthenticatedUser([Role.TEACHER, Role.STUDENT]);
    const image = await readAssignmentQuestionImage(actor, id.data);
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}
