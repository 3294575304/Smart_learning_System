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
    id: "syllabus-upload",
    title: "上传教学大纲",
    description: "上传或更换课程教学大纲文件",
    action: "上传大纲",
    path: "syllabus",
    icon: FileText,
  },
  {
    id: "syllabus-review",
    title: "审核并发布大纲",
    description: "解析大纲，审核并发布课程内容",
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
  {
    id: "teaching-progress",
    title: "教学进度",
    description: "维护课堂授课进度",
    action: "设置教学进度",
    path: "teaching-progress",
    icon: BookOpenCheck,
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

export function CourseSetupChecklist({
  courseId,
  progress,
}: {
  courseId: string;
  progress: CourseSetupProgress;
}) {
  // Distinct tasks can share a workspace, so match readiness by task ID.
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
  const questionMappingHref = `/teacher/courses/${courseId}/question-mapping`;
  entries.set("question-mapping", {
    id: "question-mapping",
    title: "题目关联",
    description: "批量匹配题目知识点并由教师确认",
    action: "查看题目关联",
    href: questionMappingHref,
    icon: ListChecks,
    steps: [],
  });
  const entryPriority = new Map([
    [`/teacher/courses/${courseId}#course-basics`, 0],
    [`/teacher/courses/${courseId}#course-classrooms`, 1],
  ]);
  const orderedEntries = [...entries.values()].sort(
    (left, right) =>
      (entryPriority.get(left.href) ?? 2) -
      (entryPriority.get(right.href) ?? 2),
  );

  return (
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
            已完成 {progress.completedCount} / {progress.totalCount} 项基础准备
          </p>
        </div>
      </div>
      <div
        aria-label="课程建设进度"
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
        <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/70 p-3">
          <p className="text-sm font-medium">
            下一步：{progress.nextStep.title}
          </p>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          基础准备已齐全。请继续核对题目关联，并按教学安排发布作业。
        </p>
      )}
      <details
        id="course-construction-details"
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
          {orderedEntries.map(
            ({ id, title, description, action, href, icon: Icon, steps }) => (
              <Link
                key={id}
                href={href}
                className="group flex min-w-0 items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3 transition-colors hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-500 group-hover:text-blue-600">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-900">
                    {title}
                  </h3>
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
                              <span className="text-xs font-medium">
                                {step.title}
                              </span>
                            )}
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${style}`}
                            >
                              <StatusIcon
                                aria-hidden="true"
                                className="size-3.5"
                              />
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
            ),
          )}
        </div>
        <p className="text-muted-foreground mt-4 text-xs leading-5">
          此处统计课程基础准备情况；“课程启用”与“大纲、图谱、考核方案正式发布”分别管理。题目关联与教材、课件等可选材料不计入准备进度。
        </p>
      </details>
    </section>
  );
}
