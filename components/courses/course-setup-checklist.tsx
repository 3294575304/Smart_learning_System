import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock3,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import type {
  CourseSetupProgress,
  SetupStepState,
} from "@/services/courses/setup-progress";

const statePresentation = {
  complete: {
    label: "已完成",
    icon: CheckCircle2,
    style: "text-emerald-700 bg-emerald-50",
  },
  pending: { label: "待完成", icon: Circle, style: "text-sky-700 bg-sky-50" },
  processing: {
    label: "处理中",
    icon: Clock3,
    style: "text-sky-700 bg-sky-50",
  },
  attention: {
    label: "需处理",
    icon: TriangleAlert,
    style: "text-amber-800 bg-amber-50",
  },
  blocked: {
    label: "等待前置步骤",
    icon: Circle,
    style: "text-muted-foreground bg-muted",
  },
} satisfies Record<
  SetupStepState,
  { label: string; icon: typeof Circle; style: string }
>;

export function CourseSetupChecklist({
  progress,
}: {
  progress: CourseSetupProgress;
}) {
  return (
    <section
      aria-labelledby="course-setup-title"
      className="bg-card rounded-xl border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" id="course-setup-title">
            开课准备
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            已完成 {progress.completedCount} / {progress.totalCount}{" "}
            项准备。根据已保存的数据更新，返回此页可继续。
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums">
          {progress.percentage}%
        </span>
      </div>
      <div
        aria-label="开课准备进度"
        aria-valuemax={progress.totalCount}
        aria-valuemin={0}
        aria-valuenow={progress.completedCount}
        aria-valuetext={`已完成 ${progress.completedCount} 项，共 ${progress.totalCount} 项`}
        className="bg-muted mt-3 h-2 overflow-hidden rounded-full"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-sky-600"
          style={{ width: `${progress.percentage}%` }}
        />
      </div>
      {progress.archived ? (
        <p className="text-muted-foreground mt-4 text-sm">
          课程已归档，以下显示保留的准备记录。
        </p>
      ) : progress.nextStep ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
          <p className="text-sm font-medium">
            下一步：{progress.nextStep.title}
          </p>
          <Link
            className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            href={progress.nextStep.href}
          >
            {progress.nextStep.action}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          基础准备已齐全。请继续核对题目关联，并按教学安排发布作业。
        </p>
      )}
      <ol className="mt-4 grid gap-3 lg:grid-cols-2">
        {progress.steps.map((step, index) => {
          const { label, icon: Icon, style } = statePresentation[step.state];
          return (
            <li
              className="flex min-w-0 flex-col rounded-lg border p-4"
              key={step.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {index + 1}. {step.title}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${style}`}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {label}
                </span>
              </div>
              <p className="text-muted-foreground mt-2 mb-3 text-sm leading-6">
                {step.detail}
              </p>
              <Link
                aria-label={`${step.title}：${step.action}`}
                className="mt-auto w-fit rounded-sm text-sm font-medium text-sky-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
                href={step.href}
              >
                {step.action} →
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="text-muted-foreground mt-4 text-xs leading-5">
        此处统计课程准备情况；“课程启用”与“大纲、图谱、考核方案正式发布”分别管理。教材、课件等可选材料不影响准备进度。
      </p>
    </section>
  );
}
