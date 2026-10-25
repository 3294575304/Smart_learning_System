"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function CourseDetailDisclosure({
  id,
  title,
  summary,
  children,
  revealOnHash = true,
}: {
  id: string;
  title: string;
  summary: string;
  children?: ReactNode;
  revealOnHash?: boolean;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!revealOnHash) return;
    const revealAnchor = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    // Next Link 的同页导航使用 History API，不一定触发原生 hashchange。
    const revealLink = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!link) return;
      const target = new URL(
        link.getAttribute("href") ?? "",
        window.location.href,
      );
      if (
        target.origin === window.location.origin &&
        target.pathname === window.location.pathname &&
        target.hash === `#${id}`
      )
        setOpen(true);
    };
    revealAnchor();
    window.addEventListener("hashchange", revealAnchor);
    document.addEventListener("click", revealLink, true);
    return () => {
      window.removeEventListener("hashchange", revealAnchor);
      document.removeEventListener("click", revealLink, true);
    };
  }, [id, revealOnHash]);
  return (
    <details
      id={id}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="bg-card group scroll-mt-24 rounded-xl border"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 rounded-xl p-4 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="font-semibold">{title}</span>
        <span className="min-w-0 flex-1 text-sm text-slate-500">{summary}</span>
        <span className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
          {open ? "收起" : "展开管理"}
          <ChevronDown
            aria-hidden="true"
            className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}
