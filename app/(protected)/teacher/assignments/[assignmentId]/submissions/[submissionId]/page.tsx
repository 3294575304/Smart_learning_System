import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { SubmissionGradingWorkspace } from "@/components/assignment-results/submission-grading-workspace";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherSubmissionForGrading } from "@/services/assignments/manual-grading";
import {
  assignmentIdSchema,
  submissionIdSchema,
} from "@/services/assignments/schemas";
import {
  personalWorkHref,
  personalWorkQuerySchema,
  personalWorkReturn,
} from "@/services/assignments/personal-work-navigation";

interface Props {
  params: Promise<{ assignmentId: string; submissionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
export default async function SubmissionGradingPage({
  params,
  searchParams,
}: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const raw = await params;
  const assignmentId = assignmentIdSchema.safeParse(raw.assignmentId);
  const submissionId = submissionIdSchema.safeParse(raw.submissionId);
  const rawQuery = await searchParams;
  const query = personalWorkQuerySchema.safeParse({
    filter: rawQuery.filter,
    returnTo: rawQuery.returnTo,
  });
  if (!assignmentId.success || !submissionId.success || !query.success)
    notFound();
  try {
    const submission = await getTeacherSubmissionForGrading(
      teacher.id,
      assignmentId.data,
      submissionId.data,
    );
    const back = personalWorkReturn(
      query.data.returnTo,
      assignmentId.data,
      submission.student.id,
      submission.assignment.classroomId,
    );
    if (rawQuery.filter === "PENDING_REVIEW")
      redirect(
        personalWorkHref(
          assignmentId.data,
          submissionId.data,
          back.href,
          "ALL",
        ),
      );
    return (
      <SubmissionGradingWorkspace
        key={submission.id}
        initialSubmission={submission}
        filter={query.data.filter}
        back={back}
      />
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
