"use client";

import { PencilLine } from "lucide-react";
import { useId } from "react";

import { attendanceLabels } from "@/components/courses/attendance-client";

const statusStyles: Record<string, string> = {
  PRESENT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  LATE: "border-amber-200 bg-amber-50 text-amber-800",
  EARLY_LEAVE: "border-orange-200 bg-orange-50 text-orange-700",
  LEAVE: "border-sky-200 bg-sky-50 text-sky-700",
  ABSENT: "border-rose-200 bg-rose-50 text-rose-700",
  PENDING: "border-slate-200 bg-slate-50 text-slate-600",
  CANCELLED: "border-slate-200 bg-slate-100 text-slate-500",
};

export function AttendanceStatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[status] ?? statusStyles.PENDING}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label ?? attendanceLabels[status] ?? status}
    </span>
  );
}

export function AttendanceStatusButton({
  status,
  disabled,
  onClick,
  studentName,
}: {
  status: string;
  disabled?: boolean;
  onClick: () => void;
  studentName: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`修改${studentName}的出勤状态：${attendanceLabels[status] ?? status}`}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium shadow-sm transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 ${statusStyles[status] ?? statusStyles.PENDING}`}
    >
      <span>{attendanceLabels[status] ?? status}</span>
      <span className="inline-flex items-center gap-1 border-l border-current/20 pl-2 text-xs">
        <PencilLine aria-hidden="true" className="size-3.5" />
        修改
      </span>
    </button>
  );
}

export function AttendanceStatusOptions({
  value,
  onChange,
  disabled = false,
  label = "出勤状态",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const name = useId();
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 text-xs font-medium text-slate-500">
        {label}
      </legend>
      <div className="flex flex-wrap gap-2">
        {Object.entries(attendanceLabels)
          .filter(([status]) => status !== "PENDING")
          .map(([status, text]) => (
            <label key={status} className="relative cursor-pointer">
              <input
                className="peer sr-only"
                type="radio"
                name={name}
                value={status}
                checked={value === status}
                onChange={() => onChange(status)}
              />
              <span className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition peer-checked:border-sky-600 peer-checked:bg-sky-50 peer-checked:font-semibold peer-checked:text-sky-800 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-sky-600 peer-disabled:cursor-not-allowed peer-disabled:opacity-50 hover:border-sky-300 hover:bg-sky-50">
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full border ${statusStyles[status]}`}
                />
                {text}
              </span>
            </label>
          ))}
      </div>
    </fieldset>
  );
}
