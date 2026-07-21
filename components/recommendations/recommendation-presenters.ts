import { RecommendationStatus, type QuestionType } from "@prisma/client";

import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

export const RECOMMENDATION_STATUS_LABELS: Record<
  RecommendationStatus,
  string
> = {
  PENDING: "待练习",
  STARTED: "进行中",
  COMPLETED: "已完成",
  DISMISSED: "已忽略",
  EXPIRED: "已失效",
};

export const RECOMMENDATION_STATUS_STYLES: Record<
  RecommendationStatus,
  string
> = {
  PENDING: "bg-blue-50 text-blue-700",
  STARTED: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-green-50 text-green-700",
  DISMISSED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-gray-100 text-gray-600",
};

export const DIFFICULTY_LABELS: Record<number, string> = {
  1: "入门",
  2: "简单",
  3: "中等",
  4: "较难",
  5: "挑战",
};

export function difficultyLabel(difficulty: number): string {
  return DIFFICULTY_LABELS[difficulty] ?? `${difficulty} 级`;
}

export function questionTypeLabel(type: QuestionType): string {
  return QUESTION_TYPE_LABELS[type];
}

export function formatRecommendationTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间未知"
    : date.toLocaleString("zh-CN");
}

export interface RecommendationFilterOption {
  href: string;
  label: string;
  status: RecommendationStatus | undefined;
}

export const RECOMMENDATION_FILTERS: RecommendationFilterOption[] = [
  { href: "/student/recommendations", label: "全部", status: undefined },
  {
    href: "/student/recommendations?status=PENDING",
    label: "待练习",
    status: RecommendationStatus.PENDING,
  },
  {
    href: "/student/recommendations?status=STARTED",
    label: "进行中",
    status: RecommendationStatus.STARTED,
  },
  {
    href: "/student/recommendations?status=COMPLETED",
    label: "已完成",
    status: RecommendationStatus.COMPLETED,
  },
];

export function parseRecommendationFilter(
  value: string | string[] | undefined,
): RecommendationStatus | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === RecommendationStatus.PENDING ||
    candidate === RecommendationStatus.STARTED ||
    candidate === RecommendationStatus.COMPLETED
    ? candidate
    : undefined;
}
