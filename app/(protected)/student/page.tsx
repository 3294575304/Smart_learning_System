import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import { FeedbackLink } from "@/components/dashboard/feedback-link";
import { Role } from "@prisma/client";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  GraduationCap,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";

import { getStudentHomeTasks } from "@/services/dashboard/student-home-tasks";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentDashboard } from "@/services/dashboard/student-dashboard";

export default async function StudentPage() {
  const student = await requirePageRole(Role.STUDENT);
  const [dashboard, tasks] = await Promise.all([
    getStudentDashboard(student.id),
    getStudentHomeTasks(student.id),
  ]);
  const deadline = (date: Date) =>
    date.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const nextTask = [
    ...dashboard.pendingAssignments.map((item) => ({
      id: `assignment:${item.id}`,
      title: item.title,
      detail: `${item.classroomName} · ${item.dueAt ? deadline(item.dueAt) + " 截止" : "未设置截止"}`,
      href: item.inProgressSubmissionId
        ? `/student/submissions/${encodeURIComponent(item.inProgressSubmissionId)}/answer`
        : `/student/assignments/${encodeURIComponent(item.id)}`,
      dueAt: item.dueAt ?? new Date("9999-12-31T00:00:00Z"),
      label: "课程作业",
    })),
    ...tasks.attendance.map((item) => ({
      id: `attendance:${item.id}`,
      title: item.session.title,
      detail: `${item.session.course.name} · ${deadline(item.session.signInClosesAt)} 结束`,
      href: "/student/attendance",
      dueAt: item.session.signInClosesAt,
      label: "待签到",
    })),
    ...tasks.surveys.map((item) => ({
      id: `survey:${item.id}`,
      title: item.title,
      detail: `${item.course.name} · ${deadline(item.dueAt)} 截止 · 不计入成绩`,
      href: `/student/surveys/${encodeURIComponent(item.id)}`,
      dueAt: item.dueAt,
      label: "课程问卷",
    })),
  ].sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())[0];
  const outstandingCount =
    dashboard.metrics.pendingCount +
    tasks.attendance.length +
    tasks.surveys.length;

  return (
    <section className="space-y-7">
      <SurveyAvailabilityRefresh at={tasks.nextSurveyChangeAt?.toISOString()} />
      <PageHeader
        actions={
          dashboard.pendingAssignments[0] ? (
            <Link
              className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white"
              href={`/student/assignments/${dashboard.pendingAssignments[0].id}`}
            >
              开始作业
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : null
        }
        description="查看近期任务、学习表现与个性化练习，安排今天的学习。"
        eyebrow="Student dashboard"
        title={`${student.displayName}，今天继续加油`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint={`${dashboard.metrics.dueSoonCount} 份将在 3 天内截止`}
          icon={BookOpenCheck}
          label="待完成作业"
          value={dashboard.metrics.pendingCount}
        />
        <StatCard
          hint="已完成并产生提交记录"
          icon={CheckCircle2}
          label="已完成作业"
          value={dashboard.metrics.completedCount}
        />
        <StatCard
          hint="基于每份作业的最新成绩"
          icon={Target}
          label="平均正确率"
          value={
            dashboard.metrics.averageAccuracy === null
              ? "—"
              : `${dashboard.metrics.averageAccuracy}%`
          }
        />
        <StatCard
          hint="最近一次已完成批改的作业"
          icon={BarChart3}
          label="最近成绩"
          value={
            dashboard.metrics.latestScore
              ? `${dashboard.metrics.latestScore.score}/${dashboard.metrics.latestScore.maxScore}`
              : "—"
          }
        />
      </div>

      <section
        aria-labelledby="next-task-heading"
        className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-sky-700 uppercase">
              下一步
            </p>
            <h2 id="next-task-heading" className="mt-1 text-lg font-semibold">
              {nextTask ? nextTask.title : "当前没有紧急待办"}
            </h2>
            {nextTask ? (
              <p className="mt-1 text-sm text-slate-600">
                {nextTask.label} · {nextTask.detail}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-600">
                可以继续完成练习，或查看所有课程任务。
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {nextTask ? (
              <Link
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
                href={nextTask.href}
              >
                继续下一项 <ArrowRight className="size-4" />
              </Link>
            ) : null}
            <Link
              className="inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href="/student/recommendations?view=recommended"
            >
              继续练习
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
          <span className="font-medium">{outstandingCount} 项待处理</span>
          <FeedbackLink
            href="/student/tasks"
            label="查看全部任务"
            icon="tasks"
          />
          <span className="text-xs text-slate-500">
            作业 {dashboard.metrics.pendingCount} · 签到{" "}
            {tasks.attendance.length} · 问卷 {tasks.surveys.length}
          </span>
          {tasks.scheduledSurveys.length ? (
            <FeedbackLink
              href="/student/surveys"
              label={`${tasks.scheduledSurveys.length} 份问卷待开放`}
              icon="tasks"
            />
          ) : null}
        </div>
      </section>

      <div className="grid gap-6">
        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">薄弱知识点</h2>
            <FeedbackLink
              href="/student/analytics"
              label="查看学情"
              icon="analytics"
            />
          </div>
          {dashboard.weakKnowledgePoints.length === 0 ? (
            <div className="text-muted-foreground flex min-h-52 items-center justify-center text-center text-sm">
              完成更多作业后将生成知识点掌握情况。
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {dashboard.weakKnowledgePoints.map((knowledgePoint) => (
                <div key={knowledgePoint.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">
                      {knowledgePoint.name}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {knowledgePoint.masteryScore}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-sky-100/70">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${knowledgePoint.masteryScore}%` }}
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
            <h2 className="font-semibold">学习趋势</h2>
            <FeedbackLink
              href="/student/assignments?view=records"
              label="我的成绩"
              icon="grades"
            />
          </div>
          <TrendChart
            emptyMessage="提交并完成批改后，这里会展示正确率趋势。"
            points={dashboard.scoreTrend}
          />
        </section>

        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">AI 推荐练习</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                推荐原因来自现有规则或 AI 分析
              </p>
            </div>
            <FeedbackLink
              href="/student/recommendations"
              label="全部推荐"
              icon="practice"
            />
          </div>
          {dashboard.recommendations.length === 0 ? (
            <div className="text-muted-foreground flex min-h-52 flex-col items-center justify-center text-center">
              <Sparkles className="h-8 w-8" />
              <p className="mt-3 text-sm">当前暂无待完成的推荐练习。</p>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.recommendations.map((recommendation) => (
                <Link
                  className="block rounded-lg border p-4 transition-colors hover:bg-sky-50/70"
                  href={`/student/recommendations/${recommendation.id}`}
                  key={recommendation.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      {recommendation.title}
                    </p>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      难度 {recommendation.difficulty}
                    </span>
                  </div>
                  <p className="text-muted-foreground mt-2 line-clamp-2 text-xs leading-5">
                    {recommendation.reason}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["我的课程", "/student/courses", GraduationCap],
          ["课程总评", "/student/results?view=course", BarChart3],
          ["学习分析", "/student/analytics", BrainCircuit],
          ["练习中心", "/student/recommendations", Sparkles],
        ].map(([label, href, Icon]) => (
          <Link
            className="bg-card flex items-center gap-3 rounded-lg border p-4 text-sm font-medium hover:bg-sky-50/70"
            href={href as string}
            key={label as string}
          >
            <Icon className="h-4 w-4 text-gray-500" />
            {label as string}
          </Link>
        ))}
      </section>
    </section>
  );
}
