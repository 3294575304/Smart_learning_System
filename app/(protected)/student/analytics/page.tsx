import { AIInsightType, Role } from "@prisma/client";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  GitBranch,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentLearningOverview } from "@/services/dashboard/student-dashboard";
import { listStudentLearnerProfileCourses } from "@/services/learner-profiles/service";

const INSIGHT_LABELS: Record<AIInsightType, string> = {
  STRENGTH: "优势",
  WEAKNESS: "薄弱点",
  RISK: "学习风险",
  SUGGESTION: "学习建议",
};

export default async function StudentAnalyticsPage() {
  const student = await requirePageRole(Role.STUDENT);
  const [overview, profileCourses] = await Promise.all([
    getStudentLearningOverview(student.id),
    listStudentLearnerProfileCourses(student.id),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium"
            href="/student/recommendations"
          >
            开始推荐练习
          </Link>
        }
        description="基于已批改作业、知识点掌握度和已有 AI 分析了解当前学习状态。"
        title="学习分析"
      />

      <section className="rounded-2xl border bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100/70 text-slate-700">
            <BookOpen aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">我的课程</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              先进入课程学习中心查看整体状态，再按需下钻画像或知识图谱。
            </p>
          </div>
        </div>
        {profileCourses.length ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {profileCourses.map((course) => (
              <article
                className="overflow-hidden rounded-xl border border-sky-100 bg-white shadow-sm shadow-sky-100/70"
                key={course.id}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                        {course.courseNo ?? "课程"}
                      </p>
                      <h3 className="mt-1 truncate font-semibold text-slate-950">
                        {course.name}
                      </h3>
                    </div>
                    <span className="shrink-0 rounded-full bg-sky-100/70 px-3 py-1 text-xs text-slate-500">
                      {course.term}
                    </span>
                  </div>
                  <Link
                    className="mt-5 flex items-center justify-between rounded-lg bg-sky-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                    href={`/student/courses/${course.id}/learning-center`}
                  >
                    进入课程学习中心
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>
                <div className="grid grid-cols-2 border-t bg-sky-50/70">
                  <Link
                    className="flex items-center gap-2 border-r px-4 py-3 text-sm text-slate-600 transition hover:bg-sky-100/70 hover:text-slate-950"
                    href={`/student/courses/${course.id}/profile`}
                  >
                    <UserRound aria-hidden="true" className="size-4" />
                    我的课程画像
                  </Link>
                  <Link
                    className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 transition hover:bg-sky-100/70 hover:text-slate-950"
                    href={`/student/courses/${course.id}/knowledge-graph`}
                  >
                    <GitBranch aria-hidden="true" className="size-4" />
                    课程知识图谱
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground mt-4 text-sm">暂无已关联课程。</p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <h2 className="font-semibold">最近正确率趋势</h2>
          <TrendChart
            emptyMessage="暂无足够的成绩数据生成趋势。"
            points={overview.scoreTrend}
          />
        </section>
        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">AI 学习总结</h2>
              <p className="text-muted-foreground mt-1 text-xs">
                展示最近一次已成功生成的分析
              </p>
            </div>
            {overview.latestAnalysis ? (
              <span className="rounded-full border px-2.5 py-1 text-xs">
                {overview.latestAnalysis.fallbackUsed ? "规则分析" : "AI 分析"}
              </span>
            ) : null}
          </div>
          {overview.latestAnalysis ? (
            <div className="mt-5">
              <p className="text-sm leading-7">
                {overview.latestAnalysis.summary ?? "本次分析未提供文字总结。"}
              </p>
              <dl className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-sky-50/70 p-3">
                  <dt className="text-muted-foreground text-xs">综合得分</dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {overview.latestAnalysis.overallScore ?? "—"}
                  </dd>
                </div>
                <div className="rounded-lg bg-sky-50/70 p-3">
                  <dt className="text-muted-foreground text-xs">分析样本</dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {overview.latestAnalysis.sampleSize}
                  </dd>
                </div>
              </dl>
              <p className="text-muted-foreground mt-4 text-xs">
                数据更新时间：
                {overview.latestAnalysis.completedAt?.toLocaleString("zh-CN") ??
                  "未提供"}
              </p>
            </div>
          ) : (
            <div className="text-muted-foreground flex min-h-52 flex-col items-center justify-center text-center text-sm">
              <BrainCircuit className="h-8 w-8" />
              <p className="mt-3">暂无足够数据生成分析。</p>
              <p className="mt-1">完成作业后可在成绩详情中生成学情分析。</p>
            </div>
          )}
        </section>
      </div>

      <section className="bg-card rounded-xl border p-5 sm:p-6">
        <h2 className="font-semibold">知识点掌握度</h2>
        {overview.masteries.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              compact
              description="完成带有知识点的作业后，系统会计算掌握度。"
              icon={BrainCircuit}
              title="暂无知识点数据"
            />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {overview.masteries.map((mastery) => (
              <article className="rounded-lg border p-4" key={mastery.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium">
                      {mastery.name}
                    </h3>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {mastery.code}
                    </p>
                  </div>
                  <span className="text-lg font-semibold">
                    {mastery.masteryScore}%
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-100/70">
                  <div
                    className="h-full rounded-full bg-sky-600"
                    style={{ width: `${mastery.masteryScore}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  已答 {mastery.answeredCount} 题 · 正确 {mastery.correctCount}{" "}
                  题 · 趋势 {mastery.trend}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      {overview.latestAnalysis?.insights.length ? (
        <section className="bg-card rounded-xl border p-5 sm:p-6">
          <h2 className="font-semibold">分析要点与建议</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {overview.latestAnalysis.insights.map((insight) => (
              <article className="rounded-lg border p-4" key={insight.id}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-medium">{insight.title}</h3>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {INSIGHT_LABELS[insight.type]}
                  </span>
                </div>
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {insight.detail}
                </p>
                {insight.recommendedAction ? (
                  <p className="mt-3 rounded-md bg-sky-50/70 p-3 text-sm">
                    {insight.recommendedAction}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
