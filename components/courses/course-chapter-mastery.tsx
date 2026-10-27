import { TriangleAlert } from "lucide-react";

import type { CourseChapterMasterySummary } from "@/services/course-analytics/metrics";

function masteryTone(score: number | null) {
  if (score === null)
    return {
      label: "未评估",
      bar: "bg-slate-300",
      track: "bg-slate-100",
      text: "text-slate-500",
    };
  if (score < 60)
    return {
      label: "需关注",
      bar: "bg-rose-500",
      track: "bg-rose-100",
      text: "text-rose-700",
    };
  if (score < 80)
    return {
      label: "巩固中",
      bar: "bg-amber-500",
      track: "bg-amber-100",
      text: "text-amber-700",
    };
  return {
    label: "掌握较好",
    bar: "bg-emerald-500",
    track: "bg-emerald-100",
    text: "text-emerald-700",
  };
}

function ChapterRow({
  chapter,
  studentCount,
}: {
  chapter: CourseChapterMasterySummary;
  studentCount: number;
}) {
  const score = chapter.averageMastery;
  const tone = masteryTone(score);
  const evidenceLabel =
    chapter.evidenceStudentCount > 0 ? "证据不足" : "未评估";
  return (
    <li className="grid gap-2 rounded-xl border border-slate-100 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_5rem] sm:items-center">
      <div className="min-w-0">
        <p className="font-medium text-slate-900">{chapter.name}</p>
        <p className="mt-0.5 text-xs leading-5 text-slate-500">
          {chapter.code ? `${chapter.code} · ` : ""}
          {chapter.assessedStudentCount}/{studentCount} 名学生可评估 · 稳定覆盖{" "}
          {chapter.stableEntryCount}/{chapter.totalEntryCount} 项
        </p>
      </div>
      <div
        role={score === null ? undefined : "progressbar"}
        aria-label={`${chapter.name}掌握度`}
        aria-valuenow={score ?? undefined}
        aria-valuemin={score === null ? undefined : 0}
        aria-valuemax={score === null ? undefined : 100}
        className={`h-2 overflow-hidden rounded-full ${tone.track}`}
      >
        <div
          className={`h-full rounded-full ${tone.bar}`}
          style={{ width: `${score ?? 0}%` }}
        />
      </div>
      <div className={`text-sm font-semibold sm:text-right ${tone.text}`}>
        {score === null ? evidenceLabel : `${score}%`}
        {score !== null ? (
          <p className="mt-0.5 text-xs font-normal">{tone.label}</p>
        ) : null}
      </div>
    </li>
  );
}

export function CourseChapterMastery({
  chapters,
  studentCount,
}: {
  chapters: CourseChapterMasterySummary[];
  studentCount: number;
}) {
  if (!chapters.length)
    return (
      <div className="mt-5 flex gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        当前课程暂无可汇总的正式章节。发布包含章节归属的正式知识图谱后，可在此查看章节掌握度。
      </div>
    );

  return (
    <div className="mt-5 flex flex-1 flex-col">
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-rose-500"
          />
          {"需关注 <60%"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-amber-500"
          />
          巩固中 60%–79.9%
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-emerald-500"
          />
          掌握较好 ≥80%
        </span>
      </div>
      <ol
        aria-label="全部章节掌握度，按从低到高排列，可滚动查看"
        tabIndex={0}
        className="mt-3 grid h-[28rem] min-h-0 grow gap-3 overflow-y-auto overscroll-contain pr-2"
        style={{ scrollbarWidth: "thin", scrollbarGutter: "stable" }}
      >
        {chapters.map((chapter) => (
          <ChapterRow
            key={chapter.chapterId}
            chapter={chapter}
            studentCount={studentCount}
          />
        ))}
      </ol>
      <p className="mt-3 text-xs leading-5 text-slate-500">
        低掌握度章节优先显示，可在列表内滚动查看全部章节。先计算每名学生的章节知识点均值，再汇总班级均值；仅采用稳定证据，未评估不计零分。覆盖项按“学生
        × 章节知识点”计数。
      </p>
    </div>
  );
}
