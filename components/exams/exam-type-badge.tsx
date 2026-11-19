import React from "react";
import { ClipboardCheck } from "lucide-react";
import type { ExamType } from "@prisma/client";
import { examTypeLabel } from "@/services/exams/exam-types";

export function ExamTypeBadge({ type }: { type?: ExamType }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
      <ClipboardCheck
        aria-hidden="true"
        className="size-3.5"
        strokeWidth={1.75}
      />
      {examTypeLabel(type)}
    </span>
  );
}
