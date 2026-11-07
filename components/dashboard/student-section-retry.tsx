"use client";

import { useState } from "react";

export function StudentSectionRetry({ message }: { message: string }) {
  const [pending, setPending] = useState(false);
  return (
    <div
      className="mt-4 space-y-3 rounded-lg bg-slate-50 p-4"
      aria-busy={pending}
    >
      <p role="alert" className="text-sm text-slate-700">
        {message}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          window.location.reload();
        }}
        className="inline-flex min-h-11 items-center rounded-lg border border-sky-200 bg-white px-3 text-sm font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50"
      >
        {pending ? "正在重试…" : "重试加载"}
      </button>
      <p role="status" className="text-xs text-slate-600">
        {pending ? "正在重新读取知识掌握。" : ""}
      </p>
    </div>
  );
}
