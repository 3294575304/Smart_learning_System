"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function TeacherWorkspaceScope({
  courses,
  courseId,
}: {
  courses: Array<{ id: string; name: string; term: string }>;
  courseId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function navigate(nextCourseId: string) {
    const params = new URLSearchParams({ courseId: nextCourseId });
    startTransition(() => router.push(`/teacher?${params.toString()}`));
  }
  return (
    <div aria-busy={pending} className="grid gap-3">
      <label className="min-w-0 space-y-1 text-xs">
        <span className="font-medium text-slate-600">当前课程</span>
        <select
          className="min-h-10 w-full rounded-lg border bg-white px-3 py-2 text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:opacity-60"
          value={courseId}
          disabled={pending}
          onChange={(event) => navigate(event.target.value)}
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.name} · {course.term}
            </option>
          ))}
        </select>
      </label>
      {pending ? (
        <p role="status" className="text-xs text-sky-700">
          正在切换课程…
        </p>
      ) : null}
    </div>
  );
}
