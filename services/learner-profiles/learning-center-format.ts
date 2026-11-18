import "server-only";

/**
 * 学习中心视图层的格式化与排序小工具。
 * 从 `learning-center.ts` 抽出来，让主文件只保留数据装配流水线；
 * 这里全部是无副作用的纯函数，方便单独测试。
 */

export type ConceptStatus =
  "MASTERED" | "DEVELOPING" | "NEEDS_SUPPORT" | "INSUFFICIENT" | "NO_EVIDENCE";

/** 从画像维度的 JSON 里安全取一个有限数值。 */
export function dimensionNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

export function shortDate(date: Date): string {
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

export function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

/** 越小越应该优先巩固。 */
export const learningPriority: Record<ConceptStatus, number> = {
  NEEDS_SUPPORT: 0,
  DEVELOPING: 1,
  INSUFFICIENT: 2,
  NO_EVIDENCE: 3,
  MASTERED: 4,
};
