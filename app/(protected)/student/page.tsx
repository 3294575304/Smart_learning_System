import { Role } from "@prisma/client";
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Sparkles,
  Target,
} from "lucide-react";
import Link from "next/link";

import { JoinClassroomForm } from "@/components/classrooms/join-classroom-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentDashboard } from "@/services/dashboard/student-dashboard";

export default async function StudentPage() {
  const student = await requirePageRole(Role.STUDENT);
  const dashboard = await getStudentDashboard(student.id);

  return (
    <section className="space-y-7">
      <PageHeader
        actions={
          dashboard.pendingAssignments[0] ? (
            <Link
              className="flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.8fr)]">
        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">待完成作业</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                越接近截止时间的作业排在越前
              </p>
            </div>
            <Link
              className="text-sm font-medium hover:underline"
              href="/student/assignments"
            >
              全部作业
            </Link>
          </div>
          {dashboard.pendingAssignments.length === 0 ? (
            <div className="text-muted-foreground flex min-h-52 flex-col items-center justify-center text-center">
              <CheckCircle2 className="h-8 w-8" />
              <p className="mt-3 text-sm">当前没有待完成作业。</p>
            </div>
          ) : (
            <div className="mt-4 divide-y">
              {dashboard.pendingAssignments.map((assignment) => {
                const hoursLeft = assignment.dueAt
                  ? Math.max(
                      0,
                      Math.ceil(
                        (assignment.dueAt.getTime() - Date.now()) / 3_600_000,
                      ),
                    )
                  : null;
                return (
                  <Link
                    className="flex items-center justify-between gap-4 py-4 first:pt-1"
                    href={`/student/assignments/${assignment.id}`}
                    key={assignment.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {assignment.title}
                      </p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {assignment.classroomName} · {assignment.questionCount}{" "}
                        题
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${
                        hoursLeft !== null && hoursLeft <= 72
                          ? "bg-amber-50 text-amber-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {hoursLeft === null
                        ? "未设置截止"
                        : hoursLeft < 24
                          ? `${hoursLeft} 小时后截止`
                          : `${Math.ceil(hoursLeft / 24)} 天后截止`}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">薄弱知识点</h2>
            <Link
              className="text-sm font-medium hover:underline"
              href="/student/analytics"
            >
              查看学情
            </Link>
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
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
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
            <Link
              className="text-sm font-medium hover:underline"
              href="/student/results"
            >
              我的成绩
            </Link>
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
            <Link
              className="text-sm font-medium hover:underline"
              href="/student/recommendations"
            >
              全部推荐
            </Link>
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
                  className="block rounded-lg border p-4 transition-colors hover:bg-gray-50"
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
          ["全部作业", "/student/assignments", Clock3],
          ["我的成绩", "/student/results", BarChart3],
          ["学情分析", "/student/analytics", BrainCircuit],
          ["推荐练习", "/student/recommendations", Sparkles],
        ].map(([label, href, Icon]) => (
          <Link
            className="bg-card flex items-center gap-3 rounded-lg border p-4 text-sm font-medium hover:bg-gray-50"
            href={href as string}
            key={label as string}
          >
            <Icon className="h-4 w-4 text-gray-500" />
            {label as string}
          </Link>
        ))}
      </section>

      <section className="bg-card rounded-xl border p-5 sm:p-6">
        <h2 className="font-semibold">加入班级</h2>
        <p className="text-muted-foreground mt-1 mb-4 text-sm">
          输入教师提供的邀请码加入新班级。
        </p>
        <div className="max-w-md">
          <JoinClassroomForm />
        </div>
      </section>
    </section>
  );
}
