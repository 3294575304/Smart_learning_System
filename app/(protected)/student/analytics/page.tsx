import { AIInsightType, Role } from "@prisma/client";
import { ArrowRight, BookOpen, BrainCircuit } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
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
          <div className="mt-4 divide-y divide-slate-100">
            {profileCourses.map((course) => (
              <Link
                key={course.id}
                href={`/student/courses/${course.id}/learning-center`}
                className="flex min-w-0 items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-sky-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium break-words">
                    {course.name}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {course.term} · 查看课程学习状态
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-sky-700"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            暂无已关联课程，可从“我的课程”查看入班方式。
          </p>
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
                最近一次生成时的历史分析，不随当前答题自动更新
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
              <p className="mb-3 rounded-lg border border-sky-100 bg-sky-50 p-3 text-xs leading-6 text-slate-700">
                该总结和综合得分反映生成时的样本。当前知识点统计可能使用不同时间和课程范围；查看掌握状态时请结合下方最新证据，避免直接比较两个分数。
              </p>
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
        <h2 className="font-semibold">历史题目学习表现</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          以下为旧题目记录的参考统计。课程知识点的掌握状态，请进入上方课程学习中心查看。
        </p>
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
                    {
                      {
                        NOT_STARTED: "尚未评估",
                        BEGINNER: "需加强",
                        DEVELOPING: "巩固中",
                        PROFICIENT: "熟练",
                        MASTERED: "掌握良好",
                      }[mastery.level]
                    }
                  </span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sky-100/70">
                  <div
                    className="h-full rounded-full bg-sky-600"
                    style={{
                      width: `${Math.min(100, Math.max(0, mastery.masteryScore))}%`,
                    }}
                  />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  已答 {mastery.answeredCount} 题 · 正确 {mastery.correctCount}{" "}
                  题 ·{" "}
                  {
                    {
                      UNKNOWN: "趋势待评估",
                      UP: "近期进步",
                      STABLE: "表现稳定",
                      DOWN: "建议巩固",
                    }[mastery.trend]
                  }
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
                {insight.recommendedAction &&
                insight.recommendedAction !== insight.detail ? (
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
