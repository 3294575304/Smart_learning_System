import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { announcementIdSchema } from "@/services/announcements/schemas";
import { publishAnnouncement } from "@/services/announcements/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";

interface Context {
  params: Promise<{ announcementId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const id = announcementIdSchema.safeParse(
      (await context.params).announcementId,
    );
    if (!id.success) return apiError("公告 ID 格式无效", 400);
    return apiSuccess(
      await publishAnnouncement(
        admin.id,
        id.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
