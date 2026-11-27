import { ArrowLeft } from "lucide-react";
import { readStudentAnalysisReturn } from "@/services/student-experience/analysis-navigation";
import { StudentAnalyticsLink } from "./student-analytics-link";

export const studentAnalysisActionClass =
  "inline-flex min-h-10 w-fit max-w-full items-center gap-1.5 rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-900 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";

export function StudentAnalysisReturnLink({ href }: { href: unknown }) {
  const back = readStudentAnalysisReturn(href);
  if (!back) return null;
  return (
    <StudentAnalyticsLink href={back} className={studentAnalysisActionClass}>
      <ArrowLeft aria-hidden="true" className="size-3.5 shrink-0" />
      返回学习分析
    </StudentAnalyticsLink>
  );
}
