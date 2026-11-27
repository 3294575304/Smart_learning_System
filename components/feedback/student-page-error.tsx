"use client";

import React, { useEffect, useState } from "react";
import {
  studentTaskHref,
  studentTaskScopeSchema,
} from "@/services/student-experience/task-scope";

export function StudentPageError({
  title = "页面暂时无法加载",
  returnHref = "/student",
  returnLabel = "返回学习中心",
  onRetry,
}: {
  title?: string;
  returnHref?: string;
  returnLabel?: string;
  /** 错误边界提供的 reset：优先用它重试，能保留筛选与滚动位置。 */
  onRetry?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [href, setHref] = useState(returnHref);
  useEffect(() => {
    const raw = Object.fromEntries(new URLSearchParams(window.location.search));
    const scope = studentTaskScopeSchema.safeParse(raw);
    if (scope.success && returnHref === "/student/assignments")
      setHref(studentTaskHref(returnHref, scope.data));
  }, [returnHref]);
  function retry() {
    setPending(true);
    if (onRetry) {
      onRetry();
      window.setTimeout(() => setPending(false), 400);
      return;
    }
    // 没有 reset 时退回整页重载，但保留当前地址与筛选参数。
    window.location.reload();
  }
  return (
    <section
      aria-busy={pending}
      className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
      <p role="alert" className="mt-2 text-sm leading-6 text-slate-600">
        页面读取失败，通常刷新一下就好。重试仍失败时，可以先返回列表再进来。
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={retry}
          className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
        >
          {pending ? "正在重试…" : "重试"}
        </button>
        <a
          href={href}
          className="border-border bg-card text-brand-strong hover:bg-muted inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
        >
          {returnLabel}
        </a>
      </div>
      <p role="status" className="mt-2 text-sm text-slate-600">
        {pending ? "正在重新读取页面。" : ""}
      </p>
    </section>
  );
}
