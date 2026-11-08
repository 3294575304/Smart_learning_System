import type { ReactNode } from "react";

/** Keep four shortcuts visible while leaving every action reachable by scrolling or keyboard. */
export function ScrollableActionGrid({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const scrollable = count > 4;
  return (
    <div className="min-w-0">
      <div
        aria-label={label}
        role="region"
        tabIndex={scrollable ? 0 : undefined}
        className="grid max-h-[344px] min-w-0 scroll-py-1 [scrollbar-width:thin] [scrollbar-color:#94a3b8_#f1f5f9] auto-rows-[80px] grid-cols-1 gap-2 overflow-y-auto overscroll-y-contain rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 sm:max-h-[168px] sm:grid-cols-2"
      >
        {children}
      </div>
      {scrollable ? (
        <p className="mt-2 text-end text-xs text-slate-500">
          共 {count} 项 · 向下滚动查看更多 ↓
        </p>
      ) : null}
    </div>
  );
}
