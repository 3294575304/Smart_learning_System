import { AIInsightType, Role } from "@prisma/client";
import { BrainCircuit } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getStudentLearningOverview } from "@/services/dashboard/student-dashboard";

const INSIGHT_LABELS: Record<AIInsightType, string> = {
  STRENGTH: "优势",
  WEAKNESS: "薄弱点",
  RISK: "学习风险",
  SUGGESTION: "学习建议",
};

export default async function StudentAnalyticsPage() {
  const student = await requirePageRole(Role.STUDENT);
  const overview = await getStudentLearningOverview(student.id);

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
        title="学情分析"
      />

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
                <div className="rounded-lg bg-gray-50 p-3">
                  <dt className="text-muted-foreground text-xs">综合得分</dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {overview.latestAnalysis.overallScore ?? "—"}
                  </dd>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <dt className="text-muted-foreground text-xs">分析样本</dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {overview.latestAnalysis.sampleSize}
                  </dd>
                </div>
              </dl>
              <p className="text-muted-foreground mt-4 text-xs">
                数据更新时间：
                {overview.latestAnalysis.completedAt?.toLocaleString("zh-CN") ?? "未提供"}
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
                    <h3 className="truncate text-sm font-medium">{mastery.name}</h3>
                    <p className="text-muted-foreground mt-1 text-xs">{mastery.code}</p>
                  </div>
                  <span className="text-lg font-semibold">{mastery.masteryScore}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-gray-800" style={{ width: `${mastery.masteryScore}%` }} />
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  已答 {mastery.answeredCount} 题 · 正确 {mastery.correctCount} 题 · 趋势 {mastery.trend}
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
                <p className="text-muted-foreground mt-2 text-sm leading-6">{insight.detail}</p>
                {insight.recommendedAction ? (
                  <p className="mt-3 rounded-md bg-gray-50 p-3 text-sm">{insight.recommendedAction}</p>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
