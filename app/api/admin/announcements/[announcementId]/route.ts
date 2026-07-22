import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  announcementIdSchema,
  announcementUpdateSchema,
} from "@/services/announcements/schemas";
import {
  getAnnouncement,
  updateAnnouncement,
} from "@/services/announcements/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";

interface Context {
  params: Promise<{ announcementId: string }>;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const id = announcementIdSchema.safeParse(
      (await context.params).announcementId,
    );
    if (!id.success) return apiError("公告 ID 格式无效", 400);
    return apiSuccess(await getAnnouncement(id.data));
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const id = announcementIdSchema.safeParse(
      (await context.params).announcementId,
    );
    if (!id.success) return apiError("公告 ID 格式无效", 400);
    const body: unknown = await request.json().catch(() => null);
    const parsed = announcementUpdateSchema.safeParse(body);
    if (!parsed.success) return apiError("公告内容不符合要求", 422);
    return apiSuccess(
      await updateAnnouncement(
        admin.id,
        id.data,
        parsed.data,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
