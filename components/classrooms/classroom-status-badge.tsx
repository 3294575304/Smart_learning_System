import type { ClassroomStatus } from "@prisma/client";
import React from "react";

import { CLASSROOM_STATUS_LABELS } from "@/services/classrooms/presentation";

const STATUS_STYLES: Record<ClassroomStatus, string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  COMPLETED: "border-blue-200 bg-blue-50 text-blue-700",
  CLOSED: "border-amber-200 bg-amber-50 text-amber-800",
  ARCHIVED: "border-slate-200 bg-slate-100 text-slate-600",
};

export function ClassroomStatusBadge({ status }: { status: ClassroomStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${STATUS_STYLES[status]}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {CLASSROOM_STATUS_LABELS[status]}
    </span>
  );
}
