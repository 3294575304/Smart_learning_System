"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type StudentClassroomOption = {
  id: string;
  name: string;
  courseName: string | null;
  term: string | null;
};

export function classroomFilterHref(
  pathname: string,
  search: string,
  classroomId: string,
) {
  const params = new URLSearchParams(search);
  params.delete("page");
  if (classroomId) params.set("classroomId", classroomId);
  else params.delete("classroomId");
  return `${pathname}${params.size ? `?${params}` : ""}`;
}

export function StudentClassroomFilter({
  classrooms,
  selectedId,
  summary,
}: {
  classrooms: StudentClassroomOption[];
  selectedId?: string;
  summary: string;
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section
      aria-label="教学班筛选"
      aria-busy={pending}
      className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3"
    >
      <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
        <span className="shrink-0 font-medium text-slate-700">教学班</span>
        <select
          aria-label="按教学班筛选"
          value={selectedId ?? ""}
          disabled={pending}
          className="min-w-0 flex-1 rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-60 sm:max-w-md"
          onChange={(event) => {
            const href = classroomFilterHref(
              pathname,
              search.toString(),
              event.target.value,
            );
            startTransition(() => router.push(href, { scroll: false }));
          }}
        >
          <option value="">全部教学班 · 查看整体</option>
          {classrooms.map((item) => (
            <option key={item.id} value={item.id}>
              {[item.courseName, item.name, item.term]
                .filter(Boolean)
                .join(" · ")}
            </option>
          ))}
        </select>
      </label>
      <p aria-live="polite" className="text-xs text-slate-500">
        {pending ? "正在切换…" : summary}
      </p>
    </section>
  );
}
