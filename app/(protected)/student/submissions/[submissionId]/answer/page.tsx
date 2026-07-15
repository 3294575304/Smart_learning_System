import { Role, SubmissionStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";

import { AnswerSheet } from "@/components/assignments/answer-sheet";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStudentSubmissionDraft } from "@/services/assignments/service";

interface Props {
  params: Promise<{ submissionId: string }>;
}
export default async function AnswerPage({ params }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const { submissionId } = await params;
  try {
    const submission = await getStudentSubmissionDraft(
      student.id,
      submissionId,
    );
    if (submission.status !== SubmissionStatus.IN_PROGRESS)
      redirect(`/student/submissions/${submissionId}/result`);
    return <AnswerSheet submission={submission} />;
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
