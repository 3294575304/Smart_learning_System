"use client";

import { Check } from "lucide-react";

import { CourseCover } from "@/components/courses/course-cover";
import { COURSE_COVER_LIST, type CourseCoverKey } from "@/lib/course-covers";
import { cn } from "@/lib/utils";

/**
 * 课程封面选择器：管理员创建 / 编辑课程模板时二选四。
 * 每个选项直接渲染真实封面（同一个 CourseCover 组件），
 * 选中的就是教师端、学生端课程卡上最终看到的样子。
 */
export function CourseCoverPicker({
  value,
  onSelect,
  sampleCourseNo = "11001827",
}: {
  value: string;
  onSelect: (key: CourseCoverKey) => void;
  sampleCourseNo?: string;
}) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2"
      role="radiogroup"
      aria-label="课程封面"
    >
      {COURSE_COVER_LIST.map((cover) => {
        const selected = cover.key === value;
        return (
          <button
            aria-checked={selected}
            className={cn(
              "group relative overflow-hidden rounded-lg border text-left transition",
              selected
                ? "border-sky-600 ring-2 ring-sky-600/25"
                : "border-border hover:border-sky-300",
            )}
            key={cover.key}
            onClick={() => onSelect(cover.key)}
            role="radio"
            type="button"
          >
            <CourseCover
              action="进入课程"
              coverKey={cover.key}
              courseNo={sampleCourseNo}
              height={52}
            />
            <div className="flex items-start justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{cover.name}</p>
                <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
                  {cover.summary}
                </p>
              </div>
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  selected
                    ? "border-sky-600 bg-sky-600 text-white"
                    : "border-muted-foreground/40 text-transparent",
                )}
              >
                <Check className="size-2.5" strokeWidth={3} />
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
