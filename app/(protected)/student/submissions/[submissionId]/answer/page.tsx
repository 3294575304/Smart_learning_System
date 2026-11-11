import { StudentRevokedAssignment } from "@/components/assignments/student-revoked-assignment";
import { AssignmentRevokedError } from "@/services/assignments/errors";
import {
  studentTaskScopeSchema,
  studentTaskHref,
} from "@/services/student-experience/task-scope";
import { assertAssignmentTaskScope } from "@/services/student-experience/task-scope-access";
import { Role, SubmissionStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { AnswerSheet } from "@/components/assignments/answer-sheet";
import { ExamMonitor } from "@/components/exams/exam-monitor";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentSubmissionDraft } from "@/services/assignments/service";
import { getSystemConfigValue } from "@/services/system-config/service";
import { getStudentExamAttemptStatus } from "@/services/exams/service";

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
    const answerSheet = { scope: scope.data, autosaveDelayMs, submission };
    if (!submission.examSessionId) return <AnswerSheet {...answerSheet} />;
    const initial = await getStudentExamAttemptStatus(student.id, submissionId);
    return (
      <ExamMonitor
        initial={initial}
        resultHref={studentTaskHref(
          `/student/submissions/${submissionId}/result`,
          scope.data,
        )}
        answerSheet={answerSheet}
      />
    );
  } catch (error: unknown) {
    if (error instanceof AssignmentRevokedError)
      return (
        <StudentRevokedAssignment
          backHref={studentTaskHref("/student/assignments", scope.data)}
        />
      );
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
