import React from "react";
import { ArrowLeft } from "lucide-react";

/**
 * 页面级返回链接。
 *
 * `solid` 是历史样式（实心品牌色）。当页面已经有面包屑时，返回动作应与面包屑同权重，
 * 用 `quiet` 降级成文字链，避免「后退」成为全页视觉最强的元素。
 */
export function StudentBackLink({
  href,
  children,
  variant = "solid",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "solid" | "quiet";
}) {
  if (variant === "quiet")
    return (
      <a
        href={href}
        className="text-brand-strong inline-flex min-h-11 w-fit max-w-full items-center gap-1.5 rounded text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
      >
        <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 break-words">{children}</span>
      </a>
    );
  return (
    <a
      href={href}
      className="inline-flex min-h-11 w-fit max-w-full items-center justify-center gap-2 rounded-xl border border-sky-600 bg-sky-700 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-sky-200/60 transition-colors hover:border-sky-700 hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
    >
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </a>
  );
}
