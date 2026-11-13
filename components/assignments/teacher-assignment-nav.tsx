import Link from "next/link";
import { teacherAssessmentHref } from "@/services/exams/classroom-navigation";

export function TeacherAssignmentNav({
  assignmentId,
  active,
  examSessionId,
}: {
  assignmentId: string;
  active: "content" | "submissions" | "results";
  examSessionId?: string | null;
}) {
  const base = teacherAssessmentHref(assignmentId, examSessionId);
  // Match the exam classroom entry: use browser navigation for all exam tabs.
  const TabLink = examSessionId ? "a" : Link;
  return (
    <nav
      aria-label={examSessionId ? "当前考试导航" : "当前作业导航"}
      className="flex flex-wrap gap-1 rounded-xl border bg-white p-1.5"
    >
      {(
        [
          ["content", examSessionId ? "查看试卷" : "作业内容", base],
          [
            "submissions",
            examSessionId ? "答卷与批改" : "提交与批改",
            `${base}/submissions`,
          ],
          ["results", "成绩统计", `${base}/results`],
        ] as const
      ).map(([key, label, href]) => (
        <TabLink
          key={key}
          href={href}
          aria-current={key === active ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${key === active ? "bg-sky-50 text-sky-800" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {label}
        </TabLink>
      ))}
    </nav>
  );
}
