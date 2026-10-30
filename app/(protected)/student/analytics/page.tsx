import { Role } from "@prisma/client";
import { BookOpen } from "lucide-react";
import { notFound } from "next/navigation";
import { ZodError } from "zod";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StudentAnalysisWorkspace } from "@/components/dashboard/student-analysis-workspace";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";
export default async function StudentAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  let data;
  try {
    data = await getStudentClassAnalytics(student.id, {
      ...(raw.courseId !== undefined && raw.courseId !== ""
        ? { courseId: raw.courseId }
        : {}),
      ...(raw.classroomId !== undefined && raw.classroomId !== ""
        ? { classroomId: raw.classroomId }
        : {}),
    });
  } catch (error) {
    if (error instanceof ResourceNotFoundError || error instanceof ZodError)
      notFound();
    throw error;
  }
  const selected =
    data.classes.find((item) => item.classroom.status === "ACTIVE") ??
    data.classes[0];
  if (!selected)
    return (
      <section className="space-y-5">
        <StudentPageHeader
          actions={<StudentCourseReturnLink />}
          title="学习分析"
          description="按课程与教学班查看个人学习情况。"
        />
        <EmptyState
          compact
          icon={BookOpen}
          title="暂无可查看的教学班"
          description="加入教学班后，可以在这里查看作业进度、成绩变化和出勤记录。"
        />
      </section>
    );
  // 课程学习中心仍提供课程级画像与正式知识图谱；本看板只显示当前教学班数据。
  return (
    <StudentAnalysisWorkspace
      selected={selected}
      contexts={data.contexts}
      updatedAt={data.updatedAt}
    />
  );
}
