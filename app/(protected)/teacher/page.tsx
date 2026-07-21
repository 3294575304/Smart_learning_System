import { AssignmentStatus, Role } from "@prisma/client";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  ClipboardCheck,
  ClipboardList,
  Plus,
  School,
  Users,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherDashboard } from "@/services/dashboard/teacher-dashboard";

const STATUS_LABELS: Record<AssignmentStatus, string> = {
  DRAFT: "草稿",
  PUBLISHED: "已发布",
  CLOSED: "已关闭",
  ARCHIVED: "已归档",
};

const STATUS_STYLES: Record<AssignmentStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-amber-50 text-amber-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

export default async function TeacherPage() {
  const teacher = await requirePageRole(Role.TEACHER);
  const dashboard = await getTeacherDashboard(teacher.id);

  return (
    <section className="space-y-7">
      <PageHeader
        actions={
          <>
            <Link
              className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
              href="/teacher/questions/new"
            >
              新建题目
            </Link>
            <Link
              className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
              href="/teacher/assignments/new"
            >
              <Plus className="h-4 w-4" />
              创建作业
            </Link>
          </>
        }
        description="集中查看班级、作业和近期学习表现，快速进入日常教学任务。"
        eyebrow="Teacher dashboard"
        title={`${teacher.displayName}，欢迎回来`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint="包含开放与已关闭班级"
          icon={School}
          label="班级数量"
          value={dashboard.metrics.classroomCount}
        />
        <StatCard
          hint="不包含已归档题目"
          icon={BookOpenCheck}
          label="我的题目"
          value={dashboard.metrics.questionCount}
        />
        <StatCard
          hint="当前处于发布状态"
          icon={ClipboardList}
          label="已发布作业"
          value={dashboard.metrics.publishedAssignmentCount}
        />
        <StatCard
          hint={
            dashboard.metrics.averageAccuracy === null
              ? "暂无已判定答题数据"
              : `学生平均正确率 ${dashboard.metrics.averageAccuracy}%`
          }
          icon={ClipboardCheck}
          label="待处理提交"
          value={dashboard.metrics.pendingReviewCount}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">近期成绩趋势</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                最近已完成批改的 8 次学生提交
              </p>
            </div>
            <Link className="text-sm font-medium hover:underline" href="/teacher/results">
              查看统计
            </Link>
          </div>
          <TrendChart
            emptyMessage="学生完成并批改作业后，这里会显示成绩趋势。"
            points={dashboard.scoreTrend}
          />
        </section>

        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <h2 className="font-semibold">常见薄弱知识点</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            按近期已判定答案的正确率排序
          </p>
          {dashboard.weakKnowledgePoints.length === 0 ? (
            <div className="text-muted-foreground flex min-h-52 items-center justify-center text-center text-sm">
              暂无足够的知识点答题数据。
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {dashboard.weakKnowledgePoints.map((knowledgePoint) => (
                <div key={knowledgePoint.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{knowledgePoint.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {knowledgePoint.accuracy}% · {knowledgePoint.answeredCount} 题
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${knowledgePoint.accuracy}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">最近作业</h2>
            <Link className="text-sm font-medium hover:underline" href="/teacher/assignments">
              全部作业
            </Link>
          </div>
          {dashboard.recentAssignments.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                action={
                  <Link className="text-sm font-medium underline" href="/teacher/assignments/new">
                    创建第一份作业
                  </Link>
                }
                compact
                description="作业创建后会出现在这里。"
                icon={ClipboardList}
                title="暂无作业"
              />
            </div>
          ) : (
            <div className="mt-4 divide-y">
              {dashboard.recentAssignments.map((assignment) => (
                <Link
                  className="flex items-center justify-between gap-4 py-4 first:pt-1 hover:text-gray-600"
                  href={
                    assignment.status === AssignmentStatus.DRAFT
                      ? `/teacher/assignments/${assignment.id}/edit`
                      : `/teacher/assignments/${assignment.id}/results`
                  }
                  key={assignment.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{assignment.title}</p>
                    <p className="text-muted-foreground mt-1 truncate text-xs">
                      {assignment.classroomName} · {assignment.submissionCount} 份提交
                      {assignment.dueAt
                        ? ` · ${assignment.dueAt.toLocaleDateString("zh-CN")} 截止`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[assignment.status]}`}
                  >
                    {STATUS_LABELS[assignment.status]}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">最近活跃班级</h2>
            <Link className="text-sm font-medium hover:underline" href="/teacher/classrooms">
              班级管理
            </Link>
          </div>
          {dashboard.activeClassrooms.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                action={
                  <Link className="text-sm font-medium underline" href="/teacher/classrooms#new-classroom">
                    创建第一个班级
                  </Link>
                }
                compact
                description="创建班级后即可邀请学生并发布作业。"
                icon={School}
                title="暂无开放班级"
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {dashboard.activeClassrooms.map((classroom) => (
                <Link
                  className="rounded-lg border p-4 transition-colors hover:bg-gray-50"
                  href={`/teacher/classrooms/${classroom.id}`}
                  key={classroom.id}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium">{classroom.name}</p>
                    <ArrowRight className="text-muted-foreground h-4 w-4 shrink-0" />
                  </div>
                  <p className="text-muted-foreground mt-2 flex items-center gap-1 text-xs">
                    <Users className="h-3.5 w-3.5" />
                    {classroom.studentCount} 名学生
                  </p>
                  <p className="text-muted-foreground mt-1 truncate text-xs">
                    最近作业：{classroom.latestAssignmentTitle ?? "暂无"}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <h2 className="font-semibold">快捷操作</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["新建题目", "/teacher/questions/new", BookOpenCheck],
            ["创建作业", "/teacher/assignments/new", ClipboardList],
            ["发布作业", "/teacher/assignments?status=DRAFT", ClipboardCheck],
            ["创建班级", "/teacher/classrooms#new-classroom", School],
            ["成绩统计", "/teacher/results", BarChart3],
          ].map(([label, href, Icon]) => (
            <Link
              className="bg-card flex items-center gap-3 rounded-lg border p-4 text-sm font-medium transition-colors hover:bg-gray-50"
              href={href as string}
              key={label as string}
            >
              <Icon className="h-4 w-4 text-gray-500" />
              {label as string}
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
