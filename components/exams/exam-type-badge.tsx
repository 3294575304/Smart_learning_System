import React from "react";
import { ClipboardCheck } from "lucide-react";
import type { ExamType } from "@prisma/client";

export function ExamTypeBadge({ type }: { type?: ExamType }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      <ClipboardCheck
        aria-hidden="true"
        className="size-3.5"
        strokeWidth={1.75}
      />
      {type === "MIDTERM"
        ? "期中考试"
        : type === "FINAL"
          ? "期末考试"
          : "课程考试"}
    </span>
  );
}
