"use client";

import { useRememberedSelection } from "@/components/dashboard/navigation-memory";
import {
  BarChart3,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  FileChartColumn,
  FilePenLine,
  Megaphone,
  MessageSquareText,
  NotebookPen,
  Shuffle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ScrollableActionGrid } from "@/components/ui/scrollable-action-grid";
import { withClassroomQuery } from "@/lib/course-classroom";

const WORKSPACE_GROUPS = [
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
        description: "查看历次签到、纠正记录和学生汇总",
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
    title: "课堂活动",
    items: [
      {
        title: "课堂签到",
        description: "发布并查看当前班级的本次签到",
        path: "check-in",
        icon: CalendarCheck,
      },
      {
        title: "发布作业",
        description: "创建并发布当前班级的作业",
        path: "/teacher/assignments/new",
        icon: NotebookPen,
      },
      {
        title: "课程通知",
        description: "发布通知给本班学生，查看历史与已读",
        path: "announcements",
        icon: Megaphone,
      },
      {
        title: "考试管理",
        description: "组卷、安排考试与查看详情",
        path: "/teacher/exams",
        icon: FilePenLine,
      },
      {
        title: "随机选人",
        description: "从当前班级的在读学生中随机抽取",
        path: "random-picker",
        icon: Shuffle,
      },
    ],
  },
  {
    title: "评价分析",
    items: [
      {
        title: "学情分析",
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
        title: "教学质量报告",
        description: "审核分析报告，下载 DOCX 与成绩工作簿",
        path: "quality-report",
        icon: FileChartColumn,
      },
    ],
  },
];

export function CourseWorkspaceNavigation({
  courseId,
  classrooms,
  initialClassroomId,
}: {
  courseId: string;
  classrooms: Array<{ id: string; name: string }>;
  initialClassroomId?: string;
}) {
  const query = useSearchParams();
  const [activeGroup, setActiveGroup] = useRememberedSelection<string>(
    "workspace-group",
    "教学管理",
    WORKSPACE_GROUPS.map((group) => group.title),
  );
  const [rememberedClassroomId, setClassroomId] = useRememberedSelection(
    "workspace-classroom",
    classrooms[0]?.id ?? "",
    classrooms.map((classroom) => classroom.id),
  );
  const requestedClassroomId = query?.get("classroomId") ?? initialClassroomId;
  const classroomId = classrooms.some(
    (item) => item.id === requestedClassroomId,
  )
    ? (requestedClassroomId ?? "")
    : classrooms.some((item) => item.id === rememberedClassroomId)
      ? rememberedClassroomId
      : (classrooms[0]?.id ?? "");
  return (
    <nav
      aria-label="课程功能"
      className="workspace-panel bg-card rounded-xl border p-4 sm:p-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div
          role="tablist"
          aria-label="课程管理分类"
          className="flex min-w-0 flex-wrap gap-2"
        >
          {WORKSPACE_GROUPS.map((group) => (
            <button
              key={group.title}
              type="button"
              role="tab"
              aria-selected={activeGroup === group.title}
              aria-controls={`course-workspace-${group.title}`}
              id={`course-workspace-tab-${group.title}`}
              tabIndex={activeGroup === group.title ? 0 : -1}
              onKeyDown={(event) => {
                const index = WORKSPACE_GROUPS.findIndex(
                  (item) => item.title === group.title,
                );
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % WORKSPACE_GROUPS.length
                    : event.key === "ArrowLeft"
                      ? (index + WORKSPACE_GROUPS.length - 1) %
                        WORKSPACE_GROUPS.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? WORKSPACE_GROUPS.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                const target = WORKSPACE_GROUPS[next];
                setActiveGroup(target.title);
                document
                  .getElementById(`course-workspace-tab-${target.title}`)
                  ?.focus();
              }}
              onClick={() => setActiveGroup(group.title)}
              className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${activeGroup === group.title ? "bg-brand text-white" : "bg-muted text-muted-foreground hover:bg-brand-soft"}`}
            >
              {group.title}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <span className="shrink-0">当前教学班</span>
          <select
            aria-label="选择课程关联班级"
            className="max-w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-slate-900 focus-visible:outline-sky-600 disabled:text-slate-400"
            value={classroomId}
            disabled={classrooms.length === 0}
            onChange={(event) => {
              setClassroomId(event.target.value);
              const url = new URL(window.location.href);
              url.searchParams.set("classroomId", event.target.value);
              window.history.replaceState(null, "", url);
            }}
          >
            {classrooms.length === 0 && <option value="">暂无课程班级</option>}
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {WORKSPACE_GROUPS.map((group) => (
        <section
          key={group.title}
          role="tabpanel"
          id={`course-workspace-${group.title}`}
          aria-labelledby={`course-workspace-tab-${group.title}`}
          hidden={activeGroup !== group.title}
        >
          <ScrollableActionGrid
            label={`${group.title}入口列表`}
            count={group.items.length}
          >
            {group.items.map(({ title, description, path, icon: Icon }) => (
              <Link
                key={path}
                href={
                  group.title === "评价分析" && path === "analytics"
                    ? withClassroomQuery(
                        `/teacher/results?courseId=${encodeURIComponent(courseId)}`,
                        classroomId,
                      )
                    : group.title === "课堂活动" && !classroomId
                      ? `/teacher/courses/${courseId}/classrooms`
                      : withClassroomQuery(
                          path.startsWith("/")
                            ? path === "/teacher/exams"
                              ? `${path}?courseId=${encodeURIComponent(courseId)}`
                              : path
                            : `/teacher/courses/${courseId}/${path}`,
                          classroomId,
                        )
                }
                className="group bg-card hover:bg-muted hover:border-brand focus-visible:outline-brand flex min-w-0 items-center gap-3 rounded-lg border p-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-500 transition-colors group-hover:border-sky-100 group-hover:text-blue-600">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-900">
                    {title}
                  </h3>
                  <p
                    title={description}
                    className="text-muted-foreground mt-1 truncate text-xs leading-5"
                  >
                    {group.title === "课堂活动" && !classroomId
                      ? "请先创建课程班级"
                      : description}
                  </p>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="size-5 shrink-0 text-sky-600 group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </ScrollableActionGrid>
        </section>
      ))}
    </nav>
  );
}
