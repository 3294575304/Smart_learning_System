import { StudentPageLink } from "./student-page-link";
import React, { type ReactNode } from "react";
import { Sparkles, BookOpen } from "lucide-react";
import { StudentPageHeader } from "./student-page-header";
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
    <section className="space-y-4">
      <StudentPageHeader
        title={`${name}，你好`}
        description="先处理近期任务，再查看学习进展。首页最多展示 5 项待办。"
        actions={
          <>
            <StudentPageLink
              href="/student/recommendations"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              <Sparkles aria-hidden="true" className="size-4" />
              自主练习
            </StudentPageLink>
            <StudentPageLink
              href="/student/wrong-questions"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-700 bg-white px-4 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
            >
              <BookOpen aria-hidden="true" className="size-4" />
              我的题库
            </StudentPageLink>
          </>
        }
      />
      {insights ?? <StudentHomeTasks overview={overview} />}
    </section>
  );
}
