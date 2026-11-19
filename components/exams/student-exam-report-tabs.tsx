"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const views = ["wrong", "paper", "overview"] as const;
type View = (typeof views)[number];

export function StudentExamReportTabs({
  wrong,
  paper,
  overview,
  wrongCount,
  paperCount,
}: Record<View, ReactNode> & { wrongCount: number; paperCount: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("tab");
  const active =
    views.find((view) => view === requested) ??
    (wrongCount > 0 ? "wrong" : "paper");
  const panels = { wrong, paper, overview };
  const labels = {
    wrong: `错题回顾 ${wrongCount}`,
    paper: `整卷索引 ${paperCount}`,
    overview: "知识点与走势",
  };
  return (
    <>
      <nav
        aria-label="报告视图"
        className="border-border flex flex-wrap gap-1 border-b"
      >
        {views.map((view) => {
          const next = new URLSearchParams(params);
          next.set("tab", view);
          const href = `${pathname}?${next}`;
          return (
            <a
              key={view}
              href={href}
              aria-current={view === active ? "page" : undefined}
              aria-controls={`exam-report-${view}`}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-700 ${view === active ? "border-brand text-brand-strong" : "border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900"}`}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                if (view !== active) window.history.pushState(null, "", href);
              }}
            >
              {labels[view]}
            </a>
          );
        })}
      </nav>
      {views.map((view) => (
        <div
          key={view}
          id={`exam-report-${view}`}
          className="space-y-4"
          hidden={view !== active}
        >
          {panels[view]}
        </div>
      ))}
    </>
  );
}
