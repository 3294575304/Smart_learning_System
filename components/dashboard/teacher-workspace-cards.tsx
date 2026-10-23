"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  School,
  Users,
} from "lucide-react";
import Link from "next/link";
import { TeacherAssignmentProgress } from "@/components/dashboard/teacher-assignment-progress";
import { TeacherCardClassroomFilter } from "@/components/dashboard/teacher-card-classroom-filter";
import { filterDashboardClassroomItems } from "@/services/dashboard/teacher-dashboard-view";
import type { TeacherDashboardData } from "@/services/dashboard/teacher-dashboard";

import styles from "./teacher-workspace.module.css";

import { TEACHER_WORKSPACE_DIRTY } from "./teacher-workspace-refresh";

type Workspace = NonNullable<TeacherDashboardData["workspace"]>;
export function TeacherWorkspaceCards({ workspace }: { workspace: Workspace }) {
  const [todoClass, setTodoClass] = useState("");
  const [activityClass, setActivityClass] = useState("");
  const [overviewClass, setOverviewClass] = useState("");
  const router = useRouter();
  const [refreshing, refresh] = useTransition();
  useEffect(() => {
    const check = () => {
      try {
        if (!localStorage.getItem(TEACHER_WORKSPACE_DIRTY)) return;
        localStorage.removeItem(TEACHER_WORKSPACE_DIRTY);
        refresh(() => router.refresh());
      } catch {
        /* Optional cross-page refresh marker. */
      }
    };
    check();
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    const onStorage = (event: StorageEvent) => {
      if (event.key === TEACHER_WORKSPACE_DIRTY && event.newValue) check();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      window.removeEventListener("storage", onStorage);
    };
  }, [router]);
  const todo = filterDashboardClassroomItems(workspace.todo, todoClass, true);
  const recentAssignments = filterDashboardClassroomItems(
    workspace.recentAssignments,
    activityClass,
  ).slice(0, 4);
  const todoMetrics =
    workspace.classroomMetrics.find((item) => item.classroomId === todoClass) ??
    workspace.metrics;
  const overviewMetrics =
    workspace.classroomMetrics.find(
      (item) => item.classroomId === overviewClass,
    ) ?? workspace.metrics;
  function scopedAssignmentsHref(classroomId: string) {
    const params = new URLSearchParams({ courseId: workspace.course.id });
    if (classroomId) params.set("classroomId", classroomId);
    return `/teacher/assignments?${params.toString()}`;
  }
  const base = `/teacher/courses/${workspace.course.id}`;
  const assignmentParams = new URLSearchParams({
    courseId: workspace.course.id,
  });

  const assignmentsHref = `/teacher/assignments?${assignmentParams.toString()}`;
  const profilesHref = `${base}/profiles${overviewClass ? `?classroomId=${overviewClass}` : ""}`;
  const quickLinks = [
    {
      label: "作业管理",
      description: "布置、批改与公布成绩",
      href: assignmentsHref,
      icon: ClipboardList,
      accent: "bg-sky-50 text-sky-700 ring-sky-100",
    },
    {
      label: "班级管理",
      description: "管理班级、成员与邀请码",
      href: "/teacher/classrooms",
      icon: School,
      accent: "bg-violet-50 text-violet-700 ring-violet-100",
    },
    {
      label: "课程题库",
      description: "查看当前课程题目",
      href: `/teacher/questions?courseId=${workspace.course.id}`,
      icon: BookOpenCheck,
      accent: "bg-teal-50 text-teal-700 ring-teal-100",
    },
    {
      label: "统计分析",
      description: "进入课程分析中心",
      href: `${base}/analytics`,
      icon: BarChart3,
      accent: "bg-amber-50 text-amber-700 ring-amber-100",
    },
  ];
  const stats = [
    {
      label: "授课班级",
      value: overviewClass ? 1 : workspace.metrics.classroomCount,
      href: `${base}#course-classrooms`,
      icon: School,
    },
    {
      label: "在读学生",
      value: overviewMetrics.studentCount,
      href: profilesHref,
      icon: Users,
    },
    {
      label: "已发布作业",
      value: overviewMetrics.publishedAssignmentCount,
      href: scopedAssignmentsHref(overviewClass),
      icon: ClipboardList,
    },
    {
      label: "课程可用题目",
      value: workspace.metrics.questionCount,
      href: `/teacher/questions?courseId=${workspace.course.id}`,
      icon: BookOpenCheck,
    },
    {
      label: "正式知识点",
      value: workspace.metrics.conceptCount,
      href: `${base}/knowledge-graph`,
      icon: GitBranch,
    },
  ];
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
      <aside className="contents min-w-0 xl:grid xl:gap-4">
        <section
          aria-labelledby="quick-actions-title"
          className={`${styles.card} order-1 min-w-0 rounded-xl border bg-white p-4 xl:order-none`}
        >
          <h2
            id="quick-actions-title"
            className={`${styles.heading} font-semibold`}
          >
            快捷入口
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
            {quickLinks.map(
              ({ label, description, href, icon: Icon, accent }) => (
                <Link
                  key={label}
                  href={href}
                  className={`${styles.shortcut} group flex min-w-0 items-center gap-3 border p-3`}
                >
                  <span
                    className={`rounded-xl p-2.5 ring-1 ring-inset ${accent}`}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-1 hidden truncate text-[11px] leading-4 text-slate-500 sm:block">
                      {description}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="hidden size-3 shrink-0 text-slate-300 group-hover:text-teal-600 sm:block"
                  />
                </Link>
              ),
            )}
          </div>
        </section>
        <section
          aria-labelledby="teacher-next-actions"
          className={`${styles.card} order-2 min-w-0 rounded-xl border bg-white p-4 xl:order-none`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2
                id="teacher-next-actions"
                className={`${styles.heading} font-semibold`}
              >
                当前待办{" "}
                <span className="rounded-full bg-teal-50 px-2 text-xs font-medium text-teal-700">
                  {todo.length} 项
                </span>
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                只列需要你处理的事项，完成后自动移除。
              </p>
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
              <TeacherCardClassroomFilter
                label="待办班级"
                classrooms={workspace.classrooms}
                value={todoClass}
                onChange={setTodoClass}
              />
              <span className="text-xs text-slate-500">
                待批改 {todoMetrics.pendingReviewCount} 份 · 待公布{" "}
                {todoMetrics.publishableCount} 份
              </span>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => refresh(() => router.refresh())}
                className="rounded-lg border px-2 py-1.5 text-xs text-sky-700 disabled:opacity-60"
              >
                {refreshing ? "刷新中…" : "刷新待办"}
              </button>
            </div>
          </div>
          {refreshing ? (
            <p role="status" className="mt-2 text-xs text-slate-500">
              正在获取最新待办，班级筛选仍可使用。
            </p>
          ) : null}
          {!todo.length ? (
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-3">
              <CheckCircle2
                aria-hidden="true"
                className="size-5 shrink-0 text-emerald-600"
              />
              <div>
                <p className="text-sm font-medium text-emerald-900">
                  当前没有需要处理的事项
                </p>
                <p className="mt-1 text-xs text-emerald-800">
                  进行中的作业可在下方教学动态中查看。
                </p>
              </div>
            </div>
          ) : (
            <div
              className={`${styles.scrollArea} mt-3 max-h-48 divide-y divide-slate-100 overflow-y-auto`}
            >
              {todo.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-600"
                >
                  <span
                    className={`shrink-0 rounded-md px-2 py-1 text-xs ${item.kind === "recover" ? "bg-amber-50 text-amber-900" : item.kind === "publish" ? "bg-emerald-50 text-emerald-800" : "bg-sky-50 text-sky-800"}`}
                  >
                    {item.kind === "recover"
                      ? "待恢复"
                      : item.kind === "publish"
                        ? "待公布"
                        : "待处理"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {item.scope} · {item.detail}
                    </p>
                  </div>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-slate-400"
                  />
                </Link>
              ))}
            </div>
          )}
        </section>
        <section
          aria-labelledby="teaching-activity-title"
          className={`${styles.card} order-5 min-w-0 rounded-xl border bg-white p-4 xl:order-none`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="teaching-activity-title"
              className={`${styles.heading} font-semibold`}
            >
              近期作业动态
            </h2>
            <Link
              className="text-xs font-medium text-sky-700 hover:underline"
              href={scopedAssignmentsHref(activityClass)}
            >
              全部作业 →
            </Link>
          </div>
          <div className="mt-3">
            <TeacherCardClassroomFilter
              label="作业动态班级"
              classrooms={workspace.classrooms}
              value={activityClass}
              onChange={setActivityClass}
            />
          </div>
          {!recentAssignments.length ? (
            <p className="py-5 text-center text-sm text-slate-500">
              当前范围暂无作业。
            </p>
          ) : (
            <div
              className={`${styles.scrollArea} mt-3 max-h-64 divide-y divide-slate-100 overflow-y-auto`}
            >
              {recentAssignments.map((item) => (
                <Link
                  key={item.id}
                  href={`/teacher/assignments/${item.id}`}
                  className="group flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-slate-50 hover:text-teal-700"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.classroomName} · {item.submissionCount} 人已提交
                      {item.dueAt
                        ? ` · ${item.dueAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })} 截止`
                        : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    {item.status === "DRAFT"
                      ? "草稿"
                      : item.status === "CLOSED"
                        ? "已关闭"
                        : item.dueAt && item.dueAt <= new Date()
                          ? "已截止"
                          : "已发布"}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </aside>
      <div className="contents min-w-0 xl:grid xl:gap-4">
        <TeacherAssignmentProgress workspace={workspace} />
        <section
          aria-labelledby="course-overview-title"
          className={`${styles.card} order-4 min-w-0 rounded-xl border bg-white p-4 xl:order-none`}
        >
          <div className="flex items-center justify-between gap-3">
            <h2
              id="course-overview-title"
              className={`${styles.heading} font-semibold`}
            >
              教学概况
            </h2>
            <Link className="text-xs text-sky-700 hover:underline" href={base}>
              课程详情 →
            </Link>
          </div>
          <div className="mt-3">
            <TeacherCardClassroomFilter
              label="教学概况班级"
              classrooms={workspace.classrooms}
              value={overviewClass}
              onChange={setOverviewClass}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {stats.map(({ label, value, href, icon: Icon }) => (
              <Link
                key={label}
                href={href}
                className={`${styles.metric} group flex min-w-0 flex-col gap-2 border p-3`}
              >
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                  {label}
                </span>
                <strong className="text-2xl font-semibold tracking-tight text-slate-800 tabular-nums">
                  {value}
                </strong>
              </Link>
            ))}
          </div>
          <p className="mt-3 border-t pt-3 text-xs leading-5 text-slate-500">
            题目与知识点为课程共用资源；人数按当前班级范围去重，作业按发布班次统计。
          </p>
        </section>
      </div>
    </div>
  );
}
