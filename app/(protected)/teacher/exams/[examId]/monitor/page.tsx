import Link from "next/link";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { ExamMonitorPanel } from "@/components/exams/exam-monitor-panel";
import { ExamResultManagement } from "@/components/exams/exam-result-management";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getExamMonitor } from "@/services/exams/monitor";
import { getExamResultManagement } from "@/services/exams/result-management";
import { examMonitorScope } from "@/services/exams/result-schemas";

export default async function ExamMonitorPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const scope = examMonitorScope.safeParse({
    ...(await params),
    classroomId: (await searchParams).classroomId,
  });
  if (!scope.success) notFound();
  const { examId, classroomId } = scope.data;
  const endpoint = `/api/teacher/exams/${examId}/monitor?classroomId=${classroomId}`;
  try {
    const initial = await getExamMonitor(teacher.id, examId, classroomId);
    const management = await getExamResultManagement(
      teacher.id,
      initial.assignmentId,
    );
    return (
      <section className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <TeacherBackLink href={`/teacher/exams/${examId}`}>
              返回考试场次
            </TeacherBackLink>
            <div>
              <h1 className="text-2xl font-semibold">考试监考</h1>
              <p className="mt-1 text-sm [overflow-wrap:anywhere] text-slate-600">
                {initial.title} · {initial.classroomName}
              </p>
            </div>
          </div>
          <Link
            className="inline-flex min-h-10 items-center rounded-lg border bg-white px-3 text-sm font-medium text-sky-800 hover:bg-sky-50"
            href={`/teacher/assignments/${initial.assignmentId}/submissions?source=exam&examId=${examId}`}
          >
            答卷与批改
          </Link>
        </header>
        <ExamMonitorPanel initial={initial} endpoint={endpoint} />
        <ExamResultManagement
          assignmentId={initial.assignmentId}
          endpoint={endpoint}
          data={management}
          canConfigure={initial.canConfigurePublication}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
