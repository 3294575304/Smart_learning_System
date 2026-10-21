import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";

type Props = { params: Promise<{ courseId: string }> };

export default async function TeacherCourseAnalyticsPage({ params }: Props) {
  await requirePageRole(Role.TEACHER);
  const parsedCourseId = courseIdSchema.safeParse((await params).courseId);
  if (!parsedCourseId.success) notFound();
  redirect(
    `/teacher/results?courseId=${encodeURIComponent(parsedCourseId.data)}`,
  );
}
