type Props = {
  view: "ASSIGNMENTS" | "STUDENTS";
  section: "ALL" | "CURRENT" | "HISTORY";
  courseId?: string;
  classroomId?: string;
};

export function AssignmentManagementTabs({
  view,
  section,
  courseId,
  classroomId,
}: Props) {
  const tabs = [
    { label: "当前作业", view: "ASSIGNMENTS", section: "CURRENT" },
    { label: "历史作业", view: "ASSIGNMENTS", section: "HISTORY" },
    { label: "学生作业查询", view: "STUDENTS", section: "ALL" },
  ] as const;
  return (
    <nav aria-label="作业分区" className="flex gap-1 border-b border-sky-200">
      {tabs.map((tab) => {
        const active =
          view === tab.view && (view === "STUDENTS" || section === tab.section);
        const params = new URLSearchParams({ section: tab.section });
        if (courseId) params.set("courseId", courseId);
        if (tab.view === "STUDENTS") {
          params.set("view", "STUDENTS");
          if (classroomId) params.set("classroomId", classroomId);
        }
        return (
          <a
            key={tab.label}
            href={`/teacher/assignments?${params}`}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none sm:px-5 ${active ? "border-sky-600 text-sky-800" : "border-transparent text-slate-500 hover:bg-sky-50 hover:text-sky-700"}`}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
