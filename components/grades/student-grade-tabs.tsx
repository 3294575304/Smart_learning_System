import Link from "next/link";
import React from "react";

type StudentGradeView = "assignments" | "course";

export function StudentGradeTabs({
  activeView,
}: {
  activeView: StudentGradeView;
}) {
  const tabs: Array<{ href: string; id: StudentGradeView; label: string }> = [
    { href: "/student/results", id: "assignments", label: "作业成绩" },
    {
      href: "/student/results?view=course",
      id: "course",
      label: "课程总评",
    },
  ];

  return (
    <nav
      aria-label="成绩类型"
      className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-sky-100 bg-sky-50/70 p-1"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeView;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none ${active ? "bg-white text-sky-800 shadow-sm ring-1 ring-sky-100" : "text-slate-600 hover:bg-white/80 hover:text-sky-800"}`}
            href={tab.href}
            key={tab.id}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
