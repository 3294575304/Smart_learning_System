import { redirect } from "next/navigation";
import {
  examListContext,
  examWorkspaceHref,
} from "@/services/exams/classroom-navigation";

export default async function LegacyExamAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ examId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { examId } = await params;
  const query = await searchParams;
  redirect(
    examWorkspaceHref(
      `/teacher/exams/${encodeURIComponent(examId)}#exam-analysis`,
      examListContext(query.examList ?? query),
    ),
  );
}
