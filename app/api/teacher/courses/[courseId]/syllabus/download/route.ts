import { Role } from "@prisma/client";

import { apiError } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { downloadTeacherCourseSyllabus } from "@/services/courses/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

function encodedContentDisposition(fileName: string): string {
  const fallback =
    fileName
      .replace(/[^\x20-\x7E]+/gu, "_")
      .replace(/["\\;]/gu, "_")
      .trim() || "syllabus.pdf";
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/gu,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const { syllabus, data } = await downloadTeacherCourseSyllabus(
      teacher.id,
      parsedId.data,
    );

    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": encodedContentDisposition(syllabus.originalName),
        "cache-control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
