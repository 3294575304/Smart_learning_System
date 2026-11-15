import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 状态标记（重设计版）。
 *
 * 与 `status-badge.tsx` 的分工：
 * - `StatusBadge` 带图标，用于详情页里需要强调的单一结论；
 * - `StatusChip` 不带图标，用于列表行、答题卡、逐题回顾这类会大量重复出现的位置。
 *
 * 硬约束：任何状态都必须「色块 + 文字」同时出现，不能只靠颜色传达结果。
 */
export type StatusChipTone = "brand" | "ok" | "warn" | "bad" | "neutral" | "ai";

const toneStyles: Record<StatusChipTone, string> = {
  brand: "bg-brand-soft text-brand-strong",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  neutral: "bg-muted text-ink-soft",
  ai: "bg-ai-soft text-ai",
};

const outlineStyles: Record<StatusChipTone, string> = {
  brand: "border border-sky-200 text-brand hover:bg-brand-soft",
  ok: "border border-emerald-200 text-ok hover:bg-ok-soft",
  warn: "border border-amber-200 text-warn hover:bg-warn-soft",
  bad: "border border-rose-200 text-bad hover:bg-bad-soft",
  neutral: "border border-line text-ink-soft hover:bg-muted",
  ai: "border border-violet-200 text-ai hover:bg-ai-soft",
};

export function StatusChip({
  tone = "neutral",
  variant = "soft",
  size = "md",
  className,
  children,
}: {
  tone?: StatusChipTone;
  /** soft = 填充底色（默认）；outline = 白底描边，用于「未开始 / 可选」这类轻状态。 */
  variant?: "soft" | "outline";
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center rounded-md font-medium whitespace-nowrap",
        size === "sm"
          ? "px-1.5 py-0.5 text-[10px] leading-4"
          : "px-2 py-0.5 text-[11px] leading-5",
        variant === "outline" ? outlineStyles[tone] : toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
