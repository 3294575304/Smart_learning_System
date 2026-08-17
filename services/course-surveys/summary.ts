import type {
  CourseSurveyDimension,
  CourseSurveyQuestionType,
} from "@prisma/client";

import { backgroundJobFingerprint } from "@/services/background-jobs/fingerprint";
import {
  COURSE_SURVEY_MIN_SAMPLE_SIZE,
  COURSE_SURVEY_RULE_VERSION,
} from "@/services/course-surveys/constants";

export interface SurveySummaryQuestion {
  id: string;
  type: CourseSurveyQuestionType;
  dimension: CourseSurveyDimension;
  prompt: string;
  outcomeCode: string | null;
  outcomeTitle: string | null;
}

export interface SurveySummaryResponse {
  id: string;
  submittedAt: Date;
  answers: Array<{
    questionId: string;
    scaleValue: number | null;
    textValue: string | null;
  }>;
}

interface ScaleAccumulator {
  sum: number;
  count: number;
  distribution: [number, number, number, number, number];
}

const THEME_RULES = [
  {
    key: "PRACTICE",
    label: "实践与练习",
    words: ["实验", "上机", "练习", "实践", "项目"],
  },
  {
    key: "CONTENT",
    label: "内容与难度",
    words: ["内容", "难", "简单", "进度", "太快", "跟不上"],
  },
  {
    key: "TEACHING",
    label: "教学方法",
    words: ["讲解", "互动", "案例", "课堂", "演示"],
  },
  {
    key: "ASSESSMENT",
    label: "考核与作业",
    words: ["考试", "评分", "作业", "考核", "测验"],
  },
  {
    key: "SUPPORT",
    label: "学习支持",
    words: ["答疑", "反馈", "资源", "课件", "帮助"],
  },
] as const;

function rounded(value: number): number {
  return Number(value.toFixed(2));
}

function emptyAccumulator(): ScaleAccumulator {
  return { sum: 0, count: 0, distribution: [0, 0, 0, 0, 0] };
}

export function redactSurveyComment(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[已脱敏邮箱]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/gu, "[已脱敏手机号]")
    .replace(
      /(?:学号|姓名|手机|电话|QQ|微信)\s*[:：]?\s*[\p{L}\d_-]{2,30}/giu,
      "[已脱敏个人信息]",
    )
    .replace(/(?<!\d)\d{8,20}(?!\d)/gu, "[已脱敏编号]")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 1000);
}

export function buildSurveySummary(input: {
  surveyId: string;
  eligibleCount: number;
  questions: SurveySummaryQuestion[];
  responses: SurveySummaryResponse[];
  minSampleSize?: number;
}) {
  const minSampleSize = input.minSampleSize ?? COURSE_SURVEY_MIN_SAMPLE_SIZE;
  const responseCount = input.responses.length;
  const isSuppressed = responseCount < minSampleSize;
  const questionById = new Map(input.questions.map((item) => [item.id, item]));
  const accumulators = new Map<string, ScaleAccumulator>();
  const comments: string[] = [];

  for (const response of input.responses) {
    for (const answer of response.answers) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;
      if (
        answer.scaleValue !== null &&
        answer.scaleValue >= 1 &&
        answer.scaleValue <= 5
      ) {
        const current = accumulators.get(question.id) ?? emptyAccumulator();
        current.sum += answer.scaleValue;
        current.count += 1;
        current.distribution[answer.scaleValue - 1] += 1;
        accumulators.set(question.id, current);
      }
      if (answer.textValue?.trim())
        comments.push(redactSurveyComment(answer.textValue));
    }
  }

  const fingerprint = backgroundJobFingerprint({
    surveyId: input.surveyId,
    ruleVersion: COURSE_SURVEY_RULE_VERSION,
    eligibleCount: input.eligibleCount,
    questions: input.questions,
    responses: input.responses.map((response) => ({
      id: response.id,
      submittedAt: response.submittedAt.toISOString(),
      answers: response.answers,
    })),
  });
  const responseRate =
    input.eligibleCount > 0 ? responseCount / input.eligibleCount : 0;
  if (isSuppressed) {
    return {
      fingerprint,
      responseCount,
      eligibleCount: input.eligibleCount,
      responseRate: rounded(responseRate),
      minSampleSize,
      isSuppressed: true,
      questions: [],
      outcomes: [],
      dimensions: [],
      overallMean: null,
      themes: [],
      themeNarrative: `当前仅 ${responseCount} 份有效回答，低于 ${minSampleSize} 份小样本阈值，已隐藏量表细分与开放题主题。`,
    };
  }

  const questionStats = input.questions.flatMap((question) => {
    const current = accumulators.get(question.id);
    if (!current?.count) return [];
    return [
      {
        questionId: question.id,
        prompt: question.prompt,
        dimension: question.dimension,
        outcomeCode: question.outcomeCode,
        outcomeTitle: question.outcomeTitle,
        count: current.count,
        mean: rounded(current.sum / current.count),
        distribution: current.distribution,
      },
    ];
  });
  const aggregate = (key: "dimension" | "outcomeCode") => {
    const grouped = new Map<
      string,
      { sum: number; count: number; title: string | null }
    >();
    for (const item of questionStats) {
      const groupKey = item[key];
      if (!groupKey) continue;
      const current = grouped.get(groupKey) ?? {
        sum: 0,
        count: 0,
        title: null,
      };
      current.sum += item.mean * item.count;
      current.count += item.count;
      current.title = key === "outcomeCode" ? item.outcomeTitle : null;
      grouped.set(groupKey, current);
    }
    return [...grouped.entries()].map(([code, item]) => ({
      code,
      title: item.title,
      count: item.count,
      mean: rounded(item.sum / item.count),
    }));
  };
  const total = questionStats.reduce(
    (sum, item) => sum + item.mean * item.count,
    0,
  );
  const totalCount = questionStats.reduce((sum, item) => sum + item.count, 0);
  const themeCounts = new Map<string, { label: string; count: number }>();
  for (const comment of comments) {
    for (const rule of THEME_RULES) {
      if (rule.words.some((word) => comment.includes(word))) {
        const current = themeCounts.get(rule.key) ?? {
          label: rule.label,
          count: 0,
        };
        current.count += 1;
        themeCounts.set(rule.key, current);
      }
    }
  }
  const themes = [...themeCounts.entries()]
    .map(([key, item]) => ({ key, ...item }))
    .sort(
      (left, right) =>
        right.count - left.count || left.key.localeCompare(right.key),
    );
  const themeNarrative = themes.length
    ? `开放题反馈主要涉及${themes
        .slice(0, 3)
        .map((item) => `${item.label}（${item.count} 条）`)
        .join("、")}。汇总已去除个人标识，不展示单份回答。`
    : "开放题未形成达到规则阈值的共性主题，报告不作额外推断。";

  return {
    fingerprint,
    responseCount,
    eligibleCount: input.eligibleCount,
    responseRate: rounded(responseRate),
    minSampleSize,
    isSuppressed: false,
    questions: questionStats,
    outcomes: aggregate("outcomeCode"),
    dimensions: aggregate("dimension"),
    overallMean: totalCount ? rounded(total / totalCount) : null,
    themes,
    themeNarrative,
  };
}

export type CourseSurveySummary = ReturnType<typeof buildSurveySummary>;
