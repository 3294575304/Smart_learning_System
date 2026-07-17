import React from "react";

import {
  LOW_CONFIDENCE_THRESHOLD,
  type LearningAnalysis,
  type LearningAnalysisMetadata,
} from "@/components/learning-analysis/learning-analysis-types";

interface Props {
  analysis: LearningAnalysis;
  metadata: LearningAnalysisMetadata | null;
}

const levelLabels: Record<LearningAnalysis["overallLevel"], string> = {
  BEGINNER: "入门",
  BASIC: "基础",
  INTERMEDIATE: "中等",
  ADVANCED: "进阶",
};

const errorPatternLabels: Record<
  LearningAnalysis["errorPatterns"][number]["type"],
  string
> = {
  CONCEPT: "概念理解",
  CALCULATION: "计算",
  CARELESS: "审题或粗心",
  METHOD: "解题方法",
  UNKNOWN: "综合错误",
};

function EmptyItem({ children }: { children: string }) {
  return <p className="text-sm text-gray-500">{children}</p>;
}

export function LearningAnalysisContent({ analysis, metadata }: Props) {
  const safeConfidence = Number.isFinite(analysis.confidence)
    ? Math.min(1, Math.max(0, analysis.confidence))
    : 0;
  const confidencePercent = Math.round(safeConfidence * 100);
  const isRule = metadata?.source === "RULE" || metadata?.fallback === true;

  return (
    <article className="min-w-0 space-y-6 rounded-xl border bg-white p-4 sm:p-6">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">学情分析</h2>
          <p className="mt-1 text-sm break-words text-gray-500">
            总体水平：{levelLabels[analysis.overallLevel]}
          </p>
        </div>
        <span className="w-fit rounded-full border px-3 py-1 text-xs">
          {isRule
            ? "规则分析"
            : metadata?.source === "AI"
              ? "AI 分析"
              : "来源未知"}
        </span>
      </header>

      {isRule ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          本结果由规则分析生成。
        </p>
      ) : null}

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border p-4">
          <h3 className="font-medium">已掌握知识点</h3>
          {analysis.masteredKnowledgePoints.length === 0 ? (
            <EmptyItem>暂无明确的已掌握知识点</EmptyItem>
          ) : (
            <ul className="mt-3 space-y-3">
              {analysis.masteredKnowledgePoints.map((item) => (
                <li
                  className="min-w-0 text-sm break-words"
                  key={item.knowledgePointId}
                >
                  <strong>{item.knowledgePointId}</strong>
                  <p className="mt-1 text-gray-600">{item.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 rounded-lg border p-4">
          <h3 className="font-medium">薄弱知识点</h3>
          {analysis.weakKnowledgePoints.length === 0 ? (
            <EmptyItem>暂无明确的薄弱知识点</EmptyItem>
          ) : (
            <ul className="mt-3 space-y-3">
              {analysis.weakKnowledgePoints.map((item) => (
                <li
                  className="min-w-0 text-sm break-words"
                  key={item.knowledgePointId}
                >
                  <strong>{item.knowledgePointId}</strong>
                  <span className="ml-2 text-gray-500">
                    程度 {item.severity}/5
                  </span>
                  <p className="mt-1 text-gray-600">{item.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border p-4">
          <h3 className="font-medium">主要错误模式</h3>
          {analysis.errorPatterns.length === 0 ? (
            <EmptyItem>暂无明显错误模式</EmptyItem>
          ) : (
            <ul className="mt-3 space-y-3">
              {analysis.errorPatterns.map((item, index) => (
                <li
                  className="text-sm break-words"
                  key={`${item.type}-${index}`}
                >
                  <strong>{errorPatternLabels[item.type]}</strong>
                  <p className="mt-1 text-gray-600">{item.evidence}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0 rounded-lg border p-4">
          <h3 className="font-medium">学习建议</h3>
          {analysis.suggestions.length === 0 ? (
            <EmptyItem>暂无学习建议</EmptyItem>
          ) : (
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
              {analysis.suggestions.map((suggestion, index) => (
                <li className="break-words" key={`${suggestion}-${index}`}>
                  {suggestion}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="grid gap-4 rounded-lg bg-gray-50 p-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">推荐练习难度</h3>
          <p className="mt-1 text-2xl font-semibold">
            {analysis.recommendedDifficulty} / 5
          </p>
        </div>
        <div>
          <h3 className="text-sm font-medium">分析置信度</h3>
          <div
            aria-label={`分析置信度 ${confidencePercent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={confidencePercent}
            className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
          >
            <div
              className="h-full rounded-full bg-gray-800"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-gray-600">{confidencePercent}%</p>
        </div>
      </section>

      {safeConfidence < LOW_CONFIDENCE_THRESHOLD ? (
        <p className="rounded-lg border p-3 text-sm text-gray-700">
          本次分析置信度较低，建议结合教师反馈综合判断。
        </p>
      ) : null}

      <footer className="min-w-0 border-t pt-4 text-xs text-gray-500">
        <p className="break-words">
          来源：
          {isRule
            ? "规则分析"
            : metadata?.source === "AI"
              ? "AI 分析"
              : "未提供"}
          {metadata?.model ? ` · 模型：${metadata.model}` : ""}
          {metadata?.promptVersion
            ? ` · Prompt 版本：${metadata.promptVersion}`
            : ""}
        </p>
        <p className="mt-1 break-words">
          分析时间：
          {metadata?.generatedAt
            ? new Date(metadata.generatedAt).toLocaleString("zh-CN")
            : "未提供"}
        </p>
      </footer>
    </article>
  );
}
