import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseSyllabusCard } from "@/components/courses/course-syllabus-card";
import { CourseSyllabusReviewPanel } from "@/components/courses/course-syllabus-review-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";

export default async function CourseSyllabusPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const courseId = courseIdSchema.safeParse((await params).courseId);
  if (!courseId.success) notFound();
  let course;
  try {
    course = await getTeacherCourse(teacher.id, courseId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            href={`/teacher/courses/${courseId.data}`}
          >
            返回课程
          </Link>
        }
        description="上传文本型 PDF，查看解析进度，并对照原文审核课程信息、目标、教学内容和目标—考核方式占比后发布正式版本。"
        title={`${course.name} · 教学大纲解析与审核`}
      />
      <CourseSyllabusCard courseId={courseId.data} />
      <CourseSyllabusReviewPanel courseId={courseId.data} />
    </section>
  );
}
