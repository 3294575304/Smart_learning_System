import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherExamDetails } from "@/services/exams/analysis";
import { teacherExamListSchema } from "@/services/exams/schemas";
import { ExamWorkspaceSummary } from "@/components/exams/exam-workspace-summary";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";

export default async function ExamDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { examId } = await params;
  let details;
  try {
    details = await getTeacherExamDetails(teacher.id, examId);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const scope = teacherExamListSchema.safeParse(await searchParams);
  const back = new URLSearchParams();
  if (scope.success && scope.data.courseId === details.exam.courseId)
    back.set("courseId", scope.data.courseId);
  if (
    scope.success &&
    scope.data.classroomId &&
    details.exam.assignments.some(
      (item) => item.classroomId === scope.data.classroomId,
    )
  )
    back.set("classroomId", scope.data.classroomId);
  if (scope.success) {
    for (const key of ["keyword", "status", "type"] as const) {
      const value = scope.data[key];
      if (value) back.set(key, value);
    }
  }
  return (
    <section className="space-y-4">
      <TeacherBackLink
        href={back.size ? `/teacher/exams?${back}` : "/teacher/exams"}
      >
        返回考试管理
      </TeacherBackLink>
      <ExamWorkspaceSummary details={details} />
    </section>
  );
}
