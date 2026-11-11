import { StudentPageLink } from "./student-page-link";
import React, { type ReactNode } from "react";
import { StudentHomeTasks } from "./student-home-tasks";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";

export function StudentHomeView({
  name,
  overview,
  insights,
}: {
  name: string;
  overview: StudentTaskOverview;
  insights?: ReactNode;
}) {
  return (
    <section className="@container mx-auto max-w-[88rem] min-w-0 rounded-[1.75rem] border border-neutral-300 bg-white p-4 text-neutral-950 sm:p-7 xl:px-9 xl:py-7">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 text-2xl font-semibold [overflow-wrap:anywhere]">
          {name}，你好
        </h1>
        <p className="sr-only">
          先处理近期任务，再查看学习进展。首页最多展示 5 项待办。
        </p>
        <div className="flex flex-wrap gap-3">
          <StudentPageLink
            href="/student/recommendations"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 bg-neutral-100 px-4 text-sm font-medium hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            自主练习
          </StudentPageLink>
          <StudentPageLink
            href="/student/wrong-questions"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 bg-neutral-100 px-4 text-sm font-medium hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          >
            我的题库
          </StudentPageLink>
        </div>
      </header>
      {insights ?? <StudentHomeTasks overview={overview} />}
    </section>
  );
}
