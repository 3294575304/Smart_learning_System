"use client";

import { useRememberedSelection } from "@/components/dashboard/navigation-memory";
import {
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileChartColumn,
  FileText,
  GitBranch,
  ListChecks,
  MessageSquareText,
  Users,
} from "lucide-react";
import Link from "next/link";

const WORKSPACE_GROUPS = [
  {
    title: "课程建设",
    items: [
      {
        title: "教学大纲",
        description: "上传大纲，解析与审核课程内容",
        path: "syllabus",
        icon: FileText,
      },
      {
        title: "知识图谱",
        description: "构建知识结构，审核与发布图谱",
        path: "knowledge-graph",
        icon: GitBranch,
      },
      {
        title: "考核方案",
        description: "配置考核项目、权重与评分标准",
        path: "assessment-scheme",
        icon: ClipboardCheck,
      },
      {
        title: "题目关联",
        description: "批量匹配题目知识点并由教师确认",
        path: "question-mapping",
        icon: ListChecks,
      },
      {
        title: "教学进度",
        description: "维护课堂授课进度",
        path: "teaching-progress",
        icon: BookOpenCheck,
      },
    ],
  },
  {
    title: "教学管理",
    items: [
      {
        title: "学生名单",
        description: "维护人员与认领信息",
        path: "students",
        icon: Users,
      },
      {
        title: "成绩台账",
        description: "管理成绩、发布与目标达成度",
        path: "gradebook",
        icon: ClipboardList,
      },
      {
        title: "出勤台账",
        description: "课堂签到、出勤记录与纠正",
        path: "attendance",
        icon: CalendarCheck,
      },
      {
        title: "课程画像",
        description: "查看班级学情与学生学习证据",
        path: "profiles",
        icon: Users,
      },
    ],
  },
  {
    title: "评价分析",
    items: [
      {
        title: "课程分析中心",
        description: "汇总教学进度、学情证据与结课状态",
        path: "analytics",
        icon: BarChart3,
      },
      {
        title: "结课问卷",
        description: "发布自评问卷，汇总教学反馈",
        path: "surveys",
        icon: MessageSquareText,
      },
      {
        title: "教学质量分析",
        description: "审核分析报告，下载 DOCX 与成绩工作簿",
        path: "quality-report",
        icon: FileChartColumn,
      },
    ],
  },
];

export function CourseWorkspaceNavigation({ courseId }: { courseId: string }) {
  const [activeGroup, setActiveGroup] = useRememberedSelection<string>(
    "workspace-group",
    "教学管理",
    ["教学管理", "课程建设", "评价分析"],
  );
  const orderedGroups = [
    WORKSPACE_GROUPS[1],
    WORKSPACE_GROUPS[0],
    WORKSPACE_GROUPS[2],
  ];
  return (
    <nav aria-label="课程功能" className="bg-card rounded-xl border p-5 sm:p-6">
      <div
        role="tablist"
        aria-label="课程管理分类"
        className="mb-4 flex flex-wrap gap-2 border-b pb-3"
      >
        {orderedGroups.map((group) => (
          <button
            key={group.title}
            type="button"
            role="tab"
            aria-selected={activeGroup === group.title}
            aria-controls={`course-workspace-${group.title}`}
            id={`course-workspace-tab-${group.title}`}
            tabIndex={activeGroup === group.title ? 0 : -1}
            onKeyDown={(event) => {
              const index = orderedGroups.findIndex(
                (item) => item.title === group.title,
              );
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % orderedGroups.length
                  : event.key === "ArrowLeft"
                    ? (index + orderedGroups.length - 1) % orderedGroups.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? orderedGroups.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              const target = orderedGroups[next];
              setActiveGroup(target.title);
              document
                .getElementById(`course-workspace-tab-${target.title}`)
                ?.focus();
            }}
            onClick={() => setActiveGroup(group.title)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${activeGroup === group.title ? "bg-sky-600 text-white" : "bg-sky-50 text-slate-600 hover:bg-sky-100"}`}
          >
            {group.title}
          </button>
        ))}
      </div>
      {WORKSPACE_GROUPS.map((group) => (
        <section
          key={group.title}
          role="tabpanel"
          id={`course-workspace-${group.title}`}
          aria-labelledby={`course-workspace-tab-${group.title}`}
          hidden={activeGroup !== group.title}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {group.items.map(({ title, description, path, icon: Icon }) => (
              <Link
                key={path}
                href={
                  group.title === "评价分析" && path === "analytics"
                    ? `/teacher/results?courseId=${encodeURIComponent(courseId)}`
                    : `/teacher/courses/${courseId}/${path}`
                }
                className="group flex min-w-0 items-center gap-3 rounded-lg border border-sky-200 bg-sky-50/80 p-3 transition-colors hover:border-sky-400 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-500 transition-colors group-hover:border-sky-100 group-hover:text-blue-600">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {description}
                  </p>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-sky-600 group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
