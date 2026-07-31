import { Role } from "@prisma/client";
import { ArrowLeft, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseRosterImportWizard } from "@/components/courses/course-roster-import-wizard";
import { PageHeader } from "@/components/dashboard/page-header";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

export default async function TeacherCourseRosterImportPage({
  params,
}: PageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { courseId } = await params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) notFound();

  let course;
  try {
    course = await getTeacherCourse(teacher.id, parsedId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            href={`/teacher/courses/${course.id}`}
          >
            <ArrowLeft className="h-4 w-4" />
            返回课程详情
          </Link>
        }
        description="上传名单、核对字段映射、处理错误并建立待认领学生身份与班级预分配。"
        title="学生名单导入"
      />

      <div className="flex items-start gap-3 rounded-lg border bg-gray-50 p-4 text-sm text-gray-700">
        <UsersRound className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          仅处理当前教师课程及其关联班级。正式导入使用服务端幂等与事务保护，重复提交不会重复创建身份或班级预分配。
        </p>
      </div>

      <CourseRosterImportWizard
        courseId={course.id}
        courseName={course.name}
        courseNo={course.courseNo}
        linkedClassrooms={course.linkedClassrooms}
        term={course.term}
      />
    </section>
  );
}
