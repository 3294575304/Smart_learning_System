"use client";

import { useState } from "react";
import { FOCUS_RING } from "./ui-focus";

export function StudentSectionRetry({ message }: { message: string }) {
  const [pending, setPending] = useState(false);
  return (
    <div
      className="mt-4 space-y-3 rounded-md bg-neutral-50 p-4"
      aria-busy={pending}
    >
      <p role="alert" className="text-sm text-neutral-700">
        {message}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setPending(true);
          window.location.reload();
        }}
        className={`text-brand-strong inline-flex min-h-11 items-center rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-200 disabled:opacity-50 ${FOCUS_RING}`}
      >
        {pending ? "正在重试…" : "重试加载"}
      </button>
      <p role="status" className="text-xs text-neutral-600">
        {pending ? "正在重新读取知识掌握。" : ""}
      </p>
    </div>
  );
}
