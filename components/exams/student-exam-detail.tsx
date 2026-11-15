import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { StudentPageHeader } from "@/components/dashboard/student-page-header";
import type { getStudentExamRecord } from "@/services/exams/student-record";
import { studentTaskScopeSchema } from "@/services/student-experience/task-scope";

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
  "inline-flex min-h-11 items-center rounded-lg border border-border bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
export const examTime = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Shanghai",
});

export function StudentExamDetailHeader({
  record,
  back,
  title,
  actions,
}: {
  record: Awaited<ReturnType<typeof getStudentExamRecord>>;
  back: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <StudentPageHeader
      eyebrow={title}
      title={record.exam.title}
      description={`${record.exam.course.name} · ${record.classroom.name} · ${record.exam.type === "MIDTERM" ? "期中考试" : "期末考试"} · ${examTime.format(record.startsAt)} 开考 · ${examTime.format(record.dueAt)} 截止`}
      actions={
        <>
          <StudentBackLink href={back}>返回我的考试</StudentBackLink>
          {actions}
        </>
      }
    />
  );
}
