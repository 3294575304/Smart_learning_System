import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LearningAnalysisContent } from "../../components/learning-analysis/learning-analysis-content";

const baseAnalysis = {
  overallLevel: "BASIC" as const,
  masteredKnowledgePoints: [
    { knowledgePointId: "kp-mastered", reason: "近期正确率稳定。" },
  ],
  weakKnowledgePoints: [
    { knowledgePointId: "kp-weak", severity: 4, reason: "连续答错。" },
  ],
  errorPatterns: [{ type: "CONCEPT" as const, evidence: "混淆了两个概念。" }],
  suggestions: ["先复习定义，再完成基础练习。"],
  recommendedDifficulty: 2,
  confidence: 0.5,
};

test("analysis content renders all result sections and low-confidence guidance", () => {
  const html = renderToStaticMarkup(
    createElement(LearningAnalysisContent, {
      analysis: baseAnalysis,
      metadata: {
        source: "AI",
        model: "model-v1",
        promptVersion: "student-analysis-v1",
        generatedAt: "2026-07-17T10:00:00.000Z",
        fallback: false,
      },
    }),
  );
  for (const text of [
    "总体水平：基础",
    "已掌握知识点",
    "薄弱知识点",
    "主要错误模式",
    "学习建议",
    "推荐练习难度",
    "分析置信度",
    "模型：model-v1",
    "本次分析置信度较低",
  ]) {
    assert.match(html, new RegExp(text, "u"));
  }
});

test("rule fallback and empty lists render as normal local content", () => {
  const html = renderToStaticMarkup(
    createElement(LearningAnalysisContent, {
      analysis: {
        ...baseAnalysis,
        masteredKnowledgePoints: [],
        weakKnowledgePoints: [],
        errorPatterns: [],
        suggestions: [],
        confidence: 0.8,
      },
      metadata: {
        source: "RULE",
        model: null,
        promptVersion: "student-analysis-v1",
        generatedAt: "2026-07-17T10:00:00.000Z",
        fallback: true,
      },
    }),
  );
  assert.match(html, /本结果由规则分析生成/u);
  assert.match(html, /暂无明确的已掌握知识点/u);
  assert.match(html, /暂无明确的薄弱知识点/u);
  assert.doesNotMatch(html, /置信度较低/u);
});
