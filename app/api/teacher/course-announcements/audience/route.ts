import { Role } from "@prisma/client";

import { announcementApiError } from "@/lib/announcement-api";
import { apiError, apiSuccess } from "@/lib/api-response";
import { courseAnnouncementAudienceQuerySchema } from "@/services/course-announcements/schemas";
import { getCourseAnnouncementAudience } from "@/services/course-announcements/service";
import { requireAuthenticatedUser } from "@/services/auth/authorization";

export async function GET(request: Request) {
  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = courseAnnouncementAudienceQuerySchema.safeParse(query);
    if (!parsed.success) return apiError("请检查班级参数", 400);
    return apiSuccess(
      await getCourseAnnouncementAudience(teacher.id, parsed.data),
    );
  } catch (error: unknown) {
    return announcementApiError(error);
  }
}
