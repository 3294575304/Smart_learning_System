import {
  BookOpenCheck,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCheck,
  FileText,
  GitBranch,
  ListChecks,
} from "lucide-react";
import Link from "next/link";

import type {
  CourseSetupProgress,
  CourseSetupStep,
} from "@/services/courses/setup-progress";

const CONSTRUCTION_ITEMS = [
  {
    id: "syllabus",
    title: "教学大纲",
    description: "上传、解析、审核并发布课程大纲",
    action: "查看大纲工作区",
    path: "syllabus",
    icon: FileText,
  },
  {
    id: "graph",
    title: "知识图谱",
    description: "构建知识结构，审核与发布图谱",
    action: "查看知识图谱",
    path: "knowledge-graph",
    icon: GitBranch,
  },
  {
    id: "assessment",
    title: "考核方案",
    description: "配置考核项目、权重与评分标准",
    action: "查看考核方案",
    path: "assessment-scheme",
    icon: ClipboardCheck,
  },
];

const statePresentation = {
  complete: {
    label: "已完成",
    icon: CheckCircle2,
    style: "text-emerald-700 bg-emerald-50",
  },
  incomplete: {
    label: "未完成",
    icon: Circle,
    style: "text-red-700 bg-red-50",
  },
};

function isEntryComplete(steps: CourseSetupStep[]) {
  return steps.length > 0 && steps.every((step) => step.state === "complete");
}

export function CourseSetupChecklist({
  courseId,
  progress,
}: {
  courseId: string;
  progress: CourseSetupProgress;
}) {
  const entries = new Map(
    CONSTRUCTION_ITEMS.map(({ path, ...item }) => {
      const href = `/teacher/courses/${courseId}/${path}`;
      return [item.id, { ...item, href, steps: [] as CourseSetupStep[] }];
    }),
  );
  for (const step of progress.steps) {
    const entry = entries.get(step.id);
    if (entry) {
      entry.steps.push(step);
    } else {
      entries.set(step.id, {
        id: step.id,
        title: step.title,
        description: step.detail,
        action: step.action,
        href: step.href,
        icon: ClipboardCheck,
        steps: [step],
      });
    }
  }
  const originalEntries = [...entries.values()].sort(
    (left, right) =>
      Number(right.id === "classrooms") - Number(left.id === "classrooms"),
  );
  const pendingEntries = originalEntries.filter(
    (entry) => !isEntryComplete(entry.steps),
  );
  const completedEntries = originalEntries.filter((entry) =>
    isEntryComplete(entry.steps),
  );
  const isComplete = progress.completedCount === progress.totalCount;
  const questionTools = [
    {
      id: "question-mapping",
      title: "题目关联",
      description: "批量匹配题目知识点并由教师确认",
      href: `/teacher/courses/${courseId}/question-mapping`,
      icon: ListChecks,
    },
    {
      id: "question-bank",
      title: "题库管理",
      description: "查看和维护本课程的题目",
      href: `/teacher/questions?courseId=${encodeURIComponent(courseId)}`,
      icon: BookOpenCheck,
    },
  ];

  const renderEntry = ({
    id,
    title,
    description,
    action,
    href,
    icon: Icon,
    steps,
  }: (typeof originalEntries)[number]) => (
    <Link
      key={id}
      href={steps[0]?.href ?? href}
      className="group flex min-w-0 items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3 transition-colors hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-500 group-hover:text-blue-600">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-slate-900">{title}</h3>
        {steps.length ? (
          <ul className="mt-2 space-y-2">
            {steps.map((step) => {
              const {
                label,
                icon: StatusIcon,
                style,
              } = statePresentation[
                step.state === "complete" ? "complete" : "incomplete"
              ];
              return (
                <li
                  key={step.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1"
                >
                  {steps.length > 1 && (
                    <span className="text-xs font-medium">{step.title}</span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${style}`}
                  >
                    <StatusIcon aria-hidden="true" className="size-3.5" />
                    {label}
                  </span>
                  <p className="text-muted-foreground text-xs leading-5">
                    {step.detail}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {description}
          </p>
        )}
      </div>
      <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-sky-700 transition-colors group-hover:border-sky-400 group-hover:bg-sky-100">
        {steps[0]?.action ?? action}
        <ChevronRight aria-hidden="true" className="size-3.5" />
      </span>
    </Link>
  );

  return (
    <>
      <section
        aria-labelledby="course-setup-title"
        className="bg-card rounded-xl border p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold" id="course-setup-title">
              课程建设
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              已完成 {progress.completedCount} / {progress.totalCount}{" "}
              项基础准备
            </p>
          </div>
        </div>
        {!isComplete && (
          <div
            aria-label="课程建设进度"
            aria-valuemax={progress.totalCount}
            aria-valuemin={0}
            aria-valuenow={progress.completedCount}
            aria-valuetext={`已完成 ${progress.completedCount} 项，共 ${progress.totalCount} 项`}
            className="mt-3 h-2 overflow-hidden rounded-full bg-red-200"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-red-600"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        )}
        {progress.archived ? (
          <p className="text-muted-foreground mt-4 text-sm">
            课程已归档，以下显示保留的准备记录。
          </p>
        ) : progress.nextStep ? (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
            <p className="text-sm font-medium">
              下一步：{progress.nextStep.title}
            </p>
          </div>
        ) : (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            基础准备已齐全，可按教学安排继续教学。
          </p>
        )}
        <details
          id="course-construction-details"
          key={isComplete ? "complete" : "incomplete"}
          open={!isComplete}
          className="group/construction mt-4"
        >
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="size-4 transition-transform group-open/construction:rotate-90"
            />
            <span className="group-open/construction:hidden">展开课程建设</span>
            <span className="hidden group-open/construction:inline">
              收起课程建设
            </span>
          </summary>
          <div className="mt-3 grid gap-2">
            {pendingEntries.map(renderEntry)}
            {completedEntries.length > 0 && (
              <details
                id="course-completed-setup-details"
                key={completedEntries.map((entry) => entry.id).join("|")}
                className="group/completed"
              >
                <summary className="flex w-fit cursor-pointer list-none items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-open/completed:rotate-90"
                  />
                  <span>已完成 {completedEntries.length} 项</span>
                  <span className="group-open/completed:hidden">· 展开</span>
                  <span className="hidden group-open/completed:inline">
                    · 收起
                  </span>
                </summary>
                <div className="mt-3 grid gap-2">
                  {completedEntries.map(renderEntry)}
                </div>
              </details>
            )}
          </div>
          <p className="text-muted-foreground mt-4 text-xs leading-5">
            此处只统计四项课程基础准备；“课程启用”与“大纲、图谱、考核方案正式发布”分别管理。题目关联、题库管理及教材、课件等可选材料不计入准备进度。
          </p>
        </details>
      </section>
      <section
        aria-labelledby="course-question-tools-title"
        className="bg-card rounded-xl border p-5"
      >
        <h2 className="text-lg font-semibold" id="course-question-tools-title">
          题目与题库
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {questionTools.map(({ id, title, description, href, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              className="group flex min-w-0 items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3 transition-colors hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-500 group-hover:text-blue-600">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-900">
                  {title}
                </span>
                <span className="text-muted-foreground mt-1 block text-xs leading-5">
                  {description}
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-sky-700"
              />
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
