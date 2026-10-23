import { ArrowRight, ClipboardCheck, FileChartColumn } from "lucide-react";
import Link from "next/link";

import type { TeacherCourseAnalytics } from "@/services/course-analytics/service";

function displayRate(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export function TeacherCourseAnalyticsView({
  data,
  classroomId,
}: {
  data: TeacherCourseAnalytics;
  classroomId?: string;
}) {
  const statistics = data.assignmentStatistics;
  const courseBase = `/teacher/courses/${data.course.id}`;
  const assignmentParams = new URLSearchParams({ courseId: data.course.id });
  if (classroomId) assignmentParams.set("classroomId", classroomId);

  return (
    <section
      aria-labelledby="course-assignment-statistics-heading"
      className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-sky-700">课程作业表现</p>
          <h2
            className="mt-1 text-xl font-semibold text-slate-900"
            id="course-assignment-statistics-heading"
          >
            作业统计
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            统计已发布和已结束的教师作业；自主练习不计入。
          </p>
        </div>
        <Link
          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
          href={`/teacher/assignments?${assignmentParams.toString()}`}
        >
          全部课程作业
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
      <p className="mt-4 text-sm text-slate-500">
        {statistics.assignmentCount} 项作业 · {statistics.studentCount}{" "}
        名有效学生
      </p>

      {statistics.assignmentCount === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="font-medium text-slate-800">暂无已发布或已结束作业</p>
          <p className="mt-1 text-sm text-slate-500">
            发布课程作业后，这里会显示完成率、得分率和分数段。
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <article className="rounded-xl bg-sky-50/70 p-4 sm:p-5">
              <p className="text-sm text-slate-500">作业完成率</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {displayRate(statistics.completionRate)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                已完成 {statistics.completedSubmissionCount} /{" "}
                {statistics.eligibleSubmissionCount} 个学生·作业组合
              </p>
            </article>
            <article className="rounded-xl bg-emerald-50/70 p-4 sm:p-5">
              <p className="text-sm text-slate-500">作业得分率</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
                {displayRate(statistics.scoreRate)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                最终评分 {statistics.finalizedSubmissionCount} 份 ·{" "}
                {statistics.scoredStudentCount} 名学生已有最终成绩
              </p>
            </article>
          </div>

          {statistics.studentCount === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">
              当前筛选范围没有有效学生，暂时无法计算作业完成率和分数段。
            </p>
          ) : (
            <section
              className="mt-6"
              aria-labelledby="score-distribution-heading"
            >
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3
                    className="font-semibold text-slate-900"
                    id="score-distribution-heading"
                  >
                    学生分数段分布
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    按每名学生已评分作业的平均得分率归档；未评分学生单列，比例以全部有效学生为准。
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  共 {statistics.studentCount} 名有效学生
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {statistics.scoreDistribution.map((band) => (
                  <div
                    aria-label={`${band.label}：${band.count} 人，占比 ${displayRate(band.ratio)}`}
                    className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_4.25rem] items-center gap-3 text-sm"
                    key={band.key}
                    role="img"
                  >
                    <span className="font-medium text-slate-700">
                      {band.label}
                    </span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-sky-500 transition-[width]"
                        style={{ width: `${band.ratio ?? 0}%` }}
                      />
                    </span>
                    <span className="text-right text-slate-700 tabular-nums">
                      {band.count} 人
                    </span>
                    <span className="text-right text-slate-500 tabular-nums">
                      {displayRate(band.ratio)}
                    </span>
                  </div>
                ))}
              </div>

              {statistics.finalizedSubmissionCount === 0 ? (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  暂无最终评分；当前有效学生均计入“未评分”。
                </p>
              ) : null}
            </section>
          )}
        </>
      )}

      <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-4">
        <Link
          className="inline-flex items-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
          href={courseBase + "/surveys"}
        >
          <ClipboardCheck aria-hidden="true" className="size-4" />
          问卷管理
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        <Link
          className="inline-flex items-center gap-2 rounded-lg border border-violet-200 px-3 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-50"
          href={courseBase + "/quality-report"}
        >
          <FileChartColumn aria-hidden="true" className="size-4" />
          教学质量报告
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </section>
  );
}
