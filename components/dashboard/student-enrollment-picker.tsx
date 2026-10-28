"use client";
import React, { useEffect, useState } from "react";
import {
  studentEnrollmentLabel,
  type StudentEnrollmentContext,
} from "@/services/courses/student-enrollment";
export function StudentEnrollmentPicker({
  contexts,
  selectedId,
  action,
}: {
  contexts: StudentEnrollmentContext[];
  selectedId: string;
  action: "/student" | "/student/analytics";
}) {
  const [value, setValue] = useState(selectedId);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const restore = () => {
      setPending(false);
      const id = new URLSearchParams(window.location.search).get("classroomId");
      setValue(
        id && contexts.some((x) => x.classroom.id === id) ? id : selectedId,
      );
    };
    restore();
    window.addEventListener("pageshow", restore);
    window.addEventListener("popstate", restore);
    return () => {
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("popstate", restore);
    };
  }, [contexts, selectedId]);
  return (
    <form
      aria-busy={pending}
      action={action}
      method="get"
      autoComplete="off"
      className="flex min-w-0 gap-2"
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">当前课程</span>
        <select
          aria-label="当前课程"
          name="classroomId"
          value={value}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            setPending(true);
            window.location.assign(
              `${action}?${new URLSearchParams({ classroomId: next })}`,
            );
          }}
          className="min-h-11 w-full min-w-0 rounded-lg border border-sky-100 bg-sky-50/40 px-3 text-sm text-slate-700"
        >
          {contexts.map((item) => (
            <option key={item.classroom.id} value={item.classroom.id}>
              {studentEnrollmentLabel(item)}
              {item.classroom.status === "ARCHIVED" ||
              item.course.status === "ARCHIVED"
                ? "（已结课）"
                : ""}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
