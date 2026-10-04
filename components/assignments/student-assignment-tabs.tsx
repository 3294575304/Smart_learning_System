import { FeedbackLink } from "@/components/dashboard/feedback-link";
export function StudentAssignmentTabs({
  view,
  courseId,
  classroomId,
}: {
  view: "work" | "records";
  courseId?: string;
  classroomId?: string;
}) {
  return (
    <nav
      aria-label="作业与成绩视图"
      className="inline-flex flex-wrap gap-1 rounded-xl border border-sky-100 bg-sky-50/70 p-1"
    >
      {(
        [
          { id: "work", label: "作业列表" },
          { id: "records", label: "提交记录与成绩" },
        ] as const
      ).map((tab) => {
        const params = new URLSearchParams({ view: tab.id });
        if (courseId) params.set("courseId", courseId);
        if (classroomId) params.set("classroomId", classroomId);
        return (
          <FeedbackLink
            key={tab.id}
            href={`/student/assignments?${params}`}
            current={view === tab.id}
            label={tab.label}
            arrow={false}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${view === tab.id ? "bg-white text-sky-800 shadow-sm ring-1 ring-sky-100" : "text-slate-600 hover:bg-white"}`}
          />
        );
      })}
    </nav>
  );
}
