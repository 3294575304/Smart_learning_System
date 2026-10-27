import { TriangleAlert } from "lucide-react";

import type { CourseAttentionConceptSummary } from "@/services/course-analytics/metrics";

function ConceptRow({ concept }: { concept: CourseAttentionConceptSummary }) {
  return (
    <li className="rounded-xl border border-rose-100 bg-rose-50/30 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium text-slate-900">
          {concept.name}
        </p>
        <span className="shrink-0 text-sm font-semibold text-rose-700 tabular-nums">
          {concept.averageMastery}%
        </span>
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {concept.code} · {concept.studentCount} 名学生可评估 ·{" "}
        {concept.attentionStudentCount} 名低于 60%
      </p>
      <div
        role="progressbar"
        aria-label={`${concept.name}平均掌握度`}
        aria-valuenow={concept.averageMastery}
        aria-valuemin={0}
        aria-valuemax={100}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-rose-100"
      >
        <div
          className="h-full rounded-full bg-rose-500"
          style={{ width: `${concept.averageMastery}%` }}
        />
      </div>
    </li>
  );
}

export function CourseAttentionConcepts({
  concepts,
}: {
  concepts: CourseAttentionConceptSummary[];
}) {
  return (
    <section
      aria-labelledby="attention-concepts-heading"
      className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-rose-700">知识点分析</p>
          <h2
            id="attention-concepts-heading"
            className="mt-1 text-lg font-semibold text-slate-900"
          >
            需关注知识点
          </h2>
        </div>
        <TriangleAlert
          aria-hidden="true"
          className="size-6 shrink-0 text-rose-500"
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        展示平均掌握度低于 60% 的知识点，低掌握度优先。
      </p>
      {concepts.length ? (
        <>
          <ol
            aria-label="需关注知识点，按掌握度从低到高排列"
            className="mt-4 space-y-2"
          >
            {concepts.slice(0, 3).map((concept) => (
              <ConceptRow key={concept.conceptId} concept={concept} />
            ))}
          </ol>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            按当前课程及班级的稳定学习证据汇总，证据不足的知识点暂不列入。
          </p>
        </>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">
          暂无可展示的需关注知识点。达到稳定证据门槛后，平均掌握度低于 60%
          的知识点会显示在这里。
        </div>
      )}
    </section>
  );
}
