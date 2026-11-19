import {
  examListContext,
  examMonitorHref,
  examWorkspaceHref,
} from "@/services/exams/classroom-navigation";
import { Role } from "@prisma/client";
import { notFound } from "next/navigation";
import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { TeacherAssignmentNav } from "@/components/assignments/teacher-assignment-nav";
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
  const query = await searchParams;
  const listContext = examListContext(query.examList);
  const scope = examMonitorScope.safeParse({
    ...(await params),
    classroomId: query.classroomId,
  });
  if (!scope.success) notFound();
  const { examId, classroomId } = scope.data;
  const endpoint = `/api/teacher/exams/${examId}/monitor?classroomId=${classroomId}`;
  const monitorHref = examWorkspaceHref(
    examMonitorHref(examId, classroomId),
    listContext,
  );
  try {
    const initial = await getExamMonitor(teacher.id, examId, classroomId);
    const management = await getExamResultManagement(
      teacher.id,
      initial.assignmentId,
    );
    return (
      <section className="space-y-5">
        <header className="space-y-3">
          <TeacherBackLink
            href={examWorkspaceHref(`/teacher/exams/${examId}`, listContext)}
          >
            返回考试场次
          </TeacherBackLink>
          <div>
            <h1 className="text-2xl font-semibold">监考与公布</h1>
            <p className="mt-1 text-sm [overflow-wrap:anywhere] text-slate-600">
              {initial.title} · {initial.classroomName}
            </p>
          </div>
        </header>
        <TeacherAssignmentNav
          assignmentId={initial.assignmentId}
          examSessionId={examId}
          classroomId={classroomId}
          active="monitor"
          listContext={listContext}
        />
        <ExamMonitorPanel
          examId={examId}
          initial={initial}
          endpoint={endpoint}
          monitorHref={monitorHref}
        />
        <ExamResultManagement
          examId={examId}
          assignmentId={initial.assignmentId}
          endpoint={endpoint}
          data={management}
          canConfigure={initial.canConfigurePublication}
          monitorHref={monitorHref}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
