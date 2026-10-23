import Link from "next/link";

export function TeacherAssignmentNav({
  assignmentId,
  active,
}: {
  assignmentId: string;
  active: "content" | "submissions" | "results";
}) {
  return (
    <nav
      aria-label="当前作业导航"
      className="flex flex-wrap gap-1 rounded-xl border bg-white p-1.5"
    >
      {(
        [
          ["content", "作业内容", `/teacher/assignments/${assignmentId}`],
          [
            "submissions",
            "提交与批改",
            `/teacher/assignments/${assignmentId}/submissions`,
          ],
          [
            "results",
            "成绩统计",
            `/teacher/assignments/${assignmentId}/results`,
          ],
        ] as const
      ).map(([key, label, href]) => (
        <Link
          key={key}
          href={href}
          aria-current={key === active ? "page" : undefined}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${key === active ? "bg-sky-50 text-sky-800" : "text-slate-600 hover:bg-slate-50"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
