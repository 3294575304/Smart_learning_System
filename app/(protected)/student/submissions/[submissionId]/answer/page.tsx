import {
  studentTaskScopeSchema,
  studentTaskHref,
} from "@/services/student-experience/task-scope";
import { assertAssignmentTaskScope } from "@/services/student-experience/task-scope-access";
import { Role, SubmissionStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { AnswerSheet } from "@/components/assignments/answer-sheet";
import { ExamMonitor } from "@/components/exams/exam-monitor";
import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentSubmissionDraft } from "@/services/assignments/service";
import { getSystemConfigValue } from "@/services/system-config/service";

interface Props {
  params: Promise<{ submissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
export default async function AnswerPage({ params, searchParams }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const { submissionId } = await params;
  const scope = studentTaskScopeSchema.safeParse(await searchParams);
  if (!scope.success) notFound();
  try {
    const [submission, autosaveDelayMs] = await Promise.all([
      getStudentSubmissionDraft(student.id, submissionId),
      getSystemConfigValue("assignmentAutosaveDelayMs"),
    ]);
    await assertAssignmentTaskScope(submission.assignmentId, scope.data);
    if (submission.status !== SubmissionStatus.IN_PROGRESS)
      redirect(
        studentTaskHref(
          `/student/submissions/${submissionId}/result`,
          scope.data,
        ),
      );
    const exam = await prisma.examSession.findFirst({
      where: {
        assignments: { some: { id: submission.assignmentId } },
        cancelledAt: null,
      },
      select: { endsAt: true, allowedSwitches: true },
    });
    return (
      <div className="space-y-3">
        {exam && (
          <ExamMonitor
            submissionId={submissionId}
            endsAt={exam.endsAt.toISOString()}
            allowedSwitches={exam.allowedSwitches}
          />
        )}
        <AnswerSheet
          scope={scope.data}
          autosaveDelayMs={autosaveDelayMs}
          submission={submission}
        />
      </div>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
