import { redirect } from "next/navigation";

export default async function LegacyExamAnalysisPage({
  params,
}: {
  params: Promise<{ examId: string }>;
}) {
  const { examId } = await params;
  redirect(`/teacher/exams/${encodeURIComponent(examId)}`);
}
