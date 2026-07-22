import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import {
  announcementCreateSchema,
  announcementListQuerySchema,
} from "@/services/announcements/schemas";
import {
  createAnnouncement,
  listAnnouncements,
} from "@/services/announcements/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { auditRequestContext } from "@/services/audit/request-context";

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser([Role.ADMIN]);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = announcementListQuerySchema.safeParse(query);
    if (!parsed.success) return apiError("请检查公告筛选条件", 400);
    return apiSuccess(await listAnnouncements(parsed.data));
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAuthenticatedUser([Role.ADMIN]);
    const body: unknown = await request.json().catch(() => null);
    const parsed = announcementCreateSchema.safeParse(body);
    if (!parsed.success) return apiError("公告内容不符合要求", 422);
    return apiSuccess(
      await createAnnouncement(
        admin.id,
        parsed.data,
        auditRequestContext(request),
      ),
      201,
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
