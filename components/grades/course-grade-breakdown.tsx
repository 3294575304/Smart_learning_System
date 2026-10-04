import type { Prisma } from "@prisma/client";
import React from "react";

import {
  hasCourseGradeOverride,
  presentCourseGradeComponents,
} from "@/services/gradebook/presentation";

export function CourseGradeBreakdown({
  components,
  snapshot,
}: {
  components: Prisma.JsonValue;
  snapshot: Prisma.JsonValue;
}) {
  const items = presentCourseGradeComponents(components);
  const hasOverride = hasCourseGradeOverride(snapshot);

  return (
    <section aria-label="成绩构成" className="mt-5 border-t pt-4">
      <h4 className="text-sm font-semibold">成绩构成</h4>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        各项成绩按以下比例计入总评，当前成绩以本次发布为准。
      </p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">暂无分项成绩明细。</p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {items.map((item, index) => (
            <li
              className="min-w-0 rounded-xl border border-sky-100 bg-sky-50/50 p-4"
              key={index}
            >
              <p className="text-sm font-medium text-slate-700">{item.name}</p>
              <p className="mt-2 text-xl font-semibold text-sky-700 tabular-nums">
                <span className="mr-1 text-xs font-normal text-slate-500">
                  占总评
                </span>
                {item.status === "EXEMPT" ? "0%" : item.actualWeight}
              </p>
              {item.adjustedWeight || item.status === "EXEMPT" ? (
                <p className="mt-1 text-xs text-slate-500">
                  方案原占比 {item.weight}
                </p>
              ) : null}
              <dl className="mt-3 space-y-2 border-t border-sky-100 pt-3 text-xs">
                <div className="flex flex-wrap justify-between gap-1">
                  <dt className="text-slate-500">当前成绩</dt>
                  <dd className="font-medium text-slate-700 tabular-nums">
                    {item.score !== null
                      ? `${item.score} 分`
                      : item.status === "EXEMPT"
                        ? "免修 / 不参与"
                        : "成绩未齐"}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-1">
                  <dt className="text-slate-500">折合总评</dt>
                  <dd className="font-medium text-slate-700 tabular-nums">
                    {item.contribution !== null
                      ? `${item.contribution} 分`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {items.some((item) => item.status === "EXEMPT") ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          免修项目不参与总评，其余项目按比例重新分配占比。
        </p>
      ) : null}
      {hasOverride ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          本次总评以教师单独录入或导入的成绩为准，分项折算仅供参考。
        </p>
      ) : items.some((item) => item.contribution !== null) ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          分项折合分数已四舍五入，合计可能与总评略有差异。
        </p>
      ) : null}
    </section>
  );
}
