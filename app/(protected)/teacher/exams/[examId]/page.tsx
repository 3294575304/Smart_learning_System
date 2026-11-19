import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherExamDetails } from "@/services/exams/analysis";
import { examListContext } from "@/services/exams/classroom-navigation";
import { ExamWorkspaceSummary } from "@/components/exams/exam-workspace-summary";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { AssignmentStateRefresh } from "@/components/assignments/state-refresh";

export default async function ExamDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const renderedAt = Date.now();
  const { examId } = await params;
  let details;
  try {
    details = await getTeacherExamDetails(teacher.id, examId);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const query = await searchParams;
  const back = examListContext(query.examList ?? query);
  return (
    <section className="space-y-4">
      <AssignmentStateRefresh renderedAt={renderedAt} />
      <TeacherBackLink
        href={back ? `/teacher/exams?${back}` : "/teacher/exams"}
      >
        返回考试管理
      </TeacherBackLink>
      <ExamWorkspaceSummary details={details} listContext={back} />
    </section>
  );
}
