import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherExamDetails } from "@/services/exams/analysis";

export default async function LegacyExamAnalysisPage({
  params,
}: {
  params: Promise<{ examId: string }>;
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
  const first = details.exam.assignments[0];
  if (!first) notFound();
  redirect(`/teacher/assignments/${first.id}?source=exam&examId=${examId}`);
}
