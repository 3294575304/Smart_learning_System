import { Role } from "@prisma/client";
import { z } from "zod";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { courseAnnouncementIdSchema } from "@/services/course-announcements/schemas";
import { publishCourseAnnouncement } from "@/services/course-announcements/service";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

const publishBodySchema = z
  .object({ confirmDuplicate: z.boolean().optional().default(false) })
  .strict();

interface Context {
  params: Promise<{ announcementId: string }>;
}

export async function POST(request: Request, context: Context) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const id = courseAnnouncementIdSchema.safeParse(
      (await context.params).announcementId,
    );
    if (!id.success) return apiError("通知 ID 格式无效", 400);
    const body: unknown = await request.json().catch(() => ({}));
    const parsed = publishBodySchema.safeParse(body ?? {});
    if (!parsed.success) return apiError("请检查发布参数", 400);
    return apiSuccess(
      await publishCourseAnnouncement(
        teacher.id,
        id.data,
        auditRequestContext(request),
        { confirmDuplicate: parsed.data.confirmDuplicate },
      ),
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
