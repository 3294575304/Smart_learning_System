import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StudentAnalysisReturnLink } from "@/components/dashboard/student-analysis-return-link";
import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import type { getStudentExamRecord } from "@/services/exams/student-record";
import { examTypeLabel } from "@/services/exams/exam-types";
import {
  examDurationMinutes,
  formatExamWindow,
} from "@/services/exams/exam-time";
import { studentTaskScopeSchema } from "@/services/student-experience/task-scope";
import { ExamAttemptBadge } from "./exam-attempt-badge";

export type StudentExamDetailProps = {
  params: Promise<{ examId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function readStudentExamDetailQuery(
  searchParams: StudentExamDetailProps["searchParams"],
) {
  const query = await searchParams;
  const scope = studentTaskScopeSchema.safeParse(query);
  if (!scope.success) notFound();
  return { scope: scope.data, returnTo: query.returnTo };
}

export const examPanelClass =
  "rounded-xl border border-border bg-card p-4 sm:p-5";
export const examActionClass =
  "inline-flex min-h-11 items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
export const examTime = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export function StudentExamDetailHeader({
  record,
  back,
  backLabel = "返回我的考试",
  title,
  actions,
  analysisReturn,
}: {
  record: Awaited<ReturnType<typeof getStudentExamRecord>>;
  back: string;
  backLabel?: string;
  /** 页面身份由面包屑承担；这里只在需要时补一条更具体的小标题。 */
  title?: string;
  actions?: ReactNode;
  analysisReturn?: string;
}) {
  const now = new Date();
  const duration = examDurationMinutes(record.startsAt, record.dueAt);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <StudentBackLink href={back}>{backLabel}</StudentBackLink>
        {analysisReturn && <StudentAnalysisReturnLink href={analysisReturn} />}
      </div>
      <StudentPageHeader
        eyebrow={title}
        title={record.exam.title}
        description={
          <>
            <span className="block">
              {record.exam.course.name} · {record.classroom.name} ·{" "}
              {examTypeLabel(record.exam.type)}
            </span>
            <span className="block">
              {formatExamWindow(record.startsAt, record.dueAt, now)}
              {duration > 0 ? ` · 限时 ${duration} 分钟` : ""}
            </span>
          </>
        }
        actions={
          <>
            <ExamAttemptBadge remaining={record.remainingAttempts} />
            {actions}
          </>
        }
      />
    </>
  );
}
