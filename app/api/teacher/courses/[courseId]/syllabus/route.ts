import { Role } from "@prisma/client";

import { apiError, apiSuccess } from "@/lib/api-response";
import { courseApiError } from "@/lib/course-api";
import { auditRequestContext } from "@/services/audit/request-context";
import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  getTeacherCourseSyllabus,
  uploadTeacherCourseSyllabus,
  type CourseSyllabusUploadFile,
} from "@/services/courses/service";

interface RouteContext {
  params: Promise<{ courseId: string }>;
}

function formDataFile(
  value: FormDataEntryValue | null,
): CourseSyllabusUploadFile | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CourseSyllabusUploadFile>;
  return typeof candidate.name === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.size === "number" &&
    typeof candidate.arrayBuffer === "function"
    ? (candidate as CourseSyllabusUploadFile)
    : null;
}

export async function GET(_request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    return apiSuccess(
      await getTeacherCourseSyllabus(teacher.id, parsedId.data),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    return apiError("课程 ID 格式无效", 400);
  }

  try {
    const teacher = await requireAuthenticatedUser([Role.TEACHER]);
    const formData = await request.formData().catch(() => null);
    const file = formDataFile(formData?.get("file") ?? null);

    return apiSuccess(
      await uploadTeacherCourseSyllabus(
        teacher.id,
        parsedId.data,
        file,
        auditRequestContext(request),
      ),
    );
  } catch (error: unknown) {
    return courseApiError(error);
  }
}
