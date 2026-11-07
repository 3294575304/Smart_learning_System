import { Role } from "@prisma/client";
import { z } from "zod";
import { assignmentApiError } from "@/lib/assignment-api";
import { apiError } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { readPaperDraftAsset } from "@/services/exams/paper-drafts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ draftId: string; assetId: string }> },
) {
  const ids = z
    .object({ draftId: z.string().cuid(), assetId: z.string().cuid() })
    .safeParse(await context.params);
  if (!ids.success) return apiError("图片 ID 无效", 400);
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const asset = await readPaperDraftAsset(
      teacher.id,
      ids.data.draftId,
      ids.data.assetId,
    );
    return new Response(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return assignmentApiError(error);
  }
}
