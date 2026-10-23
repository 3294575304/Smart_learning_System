import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";

type Props = {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TeacherCourseAnalyticsPage({
  params,
  searchParams,
}: Props) {
  await requirePageRole(Role.TEACHER);
  const parsedCourseId = courseIdSchema.safeParse((await params).courseId);
  if (!parsedCourseId.success) notFound();
  const query = new URLSearchParams({ courseId: parsedCourseId.data });
  const classroomValue = (await searchParams).classroomId;
  const classroomId =
    typeof classroomValue === "string" ? classroomValue : undefined;
  if (classroomId) query.set("classroomId", classroomId);
  redirect("/teacher/results?" + query.toString());
}
