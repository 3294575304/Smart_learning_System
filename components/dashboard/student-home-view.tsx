import { StudentPageLink } from "./student-page-link";
import { PageContainer } from "@/components/ui/workspace";
import React, { type ReactNode } from "react";
import { StudentHomeTasks } from "./student-home-tasks";
import { FOCUS_RING } from "./ui-focus";
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
    <PageContainer className="text-foreground border-border bg-surface @container rounded-xl border p-4 sm:p-6">
      {/*
        页头补一行副标题：原先标题下直接是两个等权按钮，
        学生进门第一眼看到的是"自主练习/我的题库"两个入口，
        而不是"我还有几件事"。副标题把待办总量翻到标题下方，
        两个入口用同色系的描边与实底区分主次。
      */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="min-w-0 text-[26px] leading-tight font-semibold [overflow-wrap:anywhere]">
            {name}，你好
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {overview.total > 0
              ? `共 ${overview.total} 项待办待处理，先做临近截止的`
              : "当前没有待办，可以按自己的节奏练习"}
          </p>
        </div>
        <p className="sr-only">
          先处理近期任务，再查看学习进展。首页最多展示 5 项待办。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <StudentPageLink
            href="/student/wrong-questions"
            className={`text-brand-strong border-brand bg-card hover:bg-muted inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium ${FOCUS_RING}`}
          >
            我的题库
          </StudentPageLink>
          <StudentPageLink
            href="/student/recommendations"
            className={`bg-brand hover:bg-brand-strong border-brand inline-flex min-h-11 items-center justify-center rounded-md border px-4 text-sm font-medium text-white ${FOCUS_RING}`}
          >
            自主练习
          </StudentPageLink>
        </div>
      </header>
      {insights ?? <StudentHomeTasks overview={overview} />}
    </PageContainer>
  );
}
