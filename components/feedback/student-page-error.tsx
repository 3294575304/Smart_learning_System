"use client";

import React, { useEffect, useState } from "react";
import {
  studentTaskHref,
  studentTaskScopeSchema,
} from "@/services/student-experience/task-scope";

export function StudentPageError({
  title = "页面暂时无法加载",
  returnHref = "/student",
  returnLabel = "返回学习主页",
}: {
  title?: string;
  returnHref?: string;
  returnLabel?: string;
}) {
  const [pending, setPending] = useState(false);
  const [href, setHref] = useState(returnHref);
  useEffect(() => {
    const raw = Object.fromEntries(new URLSearchParams(window.location.search));
    const scope = studentTaskScopeSchema.safeParse(raw);
    if (scope.success && returnHref === "/student/assignments")
      setHref(studentTaskHref(returnHref, scope.data));
  }, [returnHref]);
  return (
    <section
      aria-busy={pending}
      className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <h1 className="text-xl font-semibold text-slate-950">{title}</h1>
      <p role="alert" className="mt-2 text-sm leading-6 text-slate-600">
        数据读取失败，请重试。重试后仍无法打开时，可以先返回其他页面。
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            window.location.reload();
          }}
          className="inline-flex min-h-11 items-center rounded-lg bg-sky-700 px-4 text-sm font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
        >
          {pending ? "正在重试…" : "重新加载"}
        </button>
        <a
          href={href}
          className="inline-flex min-h-11 items-center rounded-lg border border-sky-200 bg-sky-50 px-4 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
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
