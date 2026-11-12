import { StudentPageLink } from "./student-page-link";
import React from "react";
import { FOCUS_RING } from "./ui-focus";
import type { StudentClassAnalysis } from "@/services/dashboard/student-class-analytics";
import { studentEnrollmentLabel } from "@/services/courses/student-enrollment";

export function StudentAssignmentRings({
  classes,
  dashboard = false,
}: {
  classes: StudentClassAnalysis[];
  dashboard?: boolean;
}) {
  const total = classes.reduce(
    (sum, item) => sum + item.assignmentProgress.total,
    0,
  );
  const submitted = classes.reduce(
    (sum, item) => sum + item.assignmentProgress.submitted,
    0,
  );
  const classProgress = (
    <>
      {classes.length ? (
        <div className="flex flex-wrap gap-3">
          {classes.map((item) => {
            const { total, submitted, overdue } = item.assignmentProgress;
            const completion = total
              ? Math.round((submitted / total) * 100)
              : null;
            /**
             * 环的三段色走 CSS 变量而非写死 hex：
             * 之前换肤必须同时改 SVG 属性，而 SVG 读不到 Tailwind 工具类。
             */
            const parts = [
              { label: "已提交", count: submitted, color: "var(--brand)" },
              {
                label: "未交未截止",
                count: total - submitted - overdue,
                color: "var(--mark-muted)",
              },
              {
                label: "逾期未交",
                count: overdue,
                color: "var(--mark-danger)",
              },
            ];
            let offset = 0;
            return (
              <StudentPageLink
                key={item.classroom.id}
                href={`/student/assignments?${new URLSearchParams({ courseId: item.course.id, classroomId: item.classroom.id })}`}
                className={`border-border hover:bg-muted flex min-w-0 flex-[1_1_16rem] items-center gap-3 rounded-xl border px-3 py-3 ${FOCUS_RING}`}
              >
                <div className="relative size-14 shrink-0">
                  <svg
                    viewBox="0 0 120 120"
                    className="size-full -rotate-90"
                    role="img"
                    aria-label={`${studentEnrollmentLabel(item)}：${total ? parts.map((p) => `${p.label}${p.count}项`).join("，") : "暂无作业"}`}
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r="47"
                      fill="none"
                      stroke="var(--progress-track)"
                      strokeWidth="10"
                    />
                    {parts.map((p) => {
                      const share = total ? (p.count / total) * 100 : 0;
                      const start = offset;
                      offset += share;
                      return (
                        <circle
                          key={p.label}
                          cx="60"
                          cy="60"
                          r="47"
                          fill="none"
                          pathLength="100"
                          stroke={p.color}
                          strokeWidth="10"
                          strokeDasharray={`${share} ${100 - share}`}
                          strokeDashoffset={-start}
                        />
                      );
                    })}
                  </svg>
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                  >
                    <strong className="text-xs font-semibold text-neutral-950 tabular-nums">
                      {total ? `${completion}%` : "—"}
                    </strong>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium [overflow-wrap:anywhere] text-neutral-900">
                    {item.course.name} · {item.classroom.name}
                  </h3>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-neutral-600">
                    {total ? (
                      <>
                        <span>
                          已交 {submitted}／共 {total} 项
                        </span>
                        {parts[1].count > 0 && (
                          <span>未交未截止 {parts[1].count}</span>
                        )}
                        {overdue > 0 && (
                          <span className="text-rose-700">
                            逾期未交 {overdue}
                          </span>
                        )}
                      </>
                    ) : (
                      "暂无作业"
                    )}
                  </p>
                </div>
              </StudentPageLink>
            );
          })}
        </div>
      ) : (
        <p className="bg-muted/65 rounded-xl p-5 text-sm text-neutral-600">
          暂无在学课程，加入课程后可查看作业进展。
        </p>
      )}
    </>
  );
  return (
    <section
      aria-labelledby="home-assignment-progress"
      className="border-border bg-card flex min-w-0 flex-col rounded-[1.25rem] border p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <div className="min-w-0">
          <h2 id="home-assignment-progress" className="text-xl font-semibold">
            {dashboard ? "作业提交进度" : "各课程作业进展"}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {dashboard ? "按教学班统计已交 / 应交" : "各班已开放的正式作业"}
          </p>
        </div>
        {dashboard && (
          <div className="flex min-w-0 flex-[1_1_12rem] items-center gap-3">
            {total > 0 ? (
              <>
                <div
                  role="progressbar"
                  aria-label="作业提交进度"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={submitted}
                  aria-valuetext={`已交 ${submitted} 项，共 ${total} 项`}
                  className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-brand h-full rounded-full"
                    style={{ width: `${(100 * submitted) / total}%` }}
                  />
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {submitted} / {total}
                </span>
              </>
            ) : (
              <p className="text-sm text-neutral-600">暂无作业</p>
            )}
          </div>
        )}
      </header>
      {dashboard ? (
        <>
          <div className="mt-3 flex min-h-0 flex-1 [scrollbar-gutter:stable] flex-col gap-2 overflow-y-auto overscroll-y-contain">
            {classProgress}
          </div>
          <footer className="border-border mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-2">
            <StudentPageLink
              href="/student/assignments"
              className={`inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4 ${FOCUS_RING}`}
            >
              查看全部作业
            </StudentPageLink>
            <p className="text-xs text-neutral-600">
              {classes.length
                ? `${classes.length} 个教学班`
                : "加入课程后自动汇总"}
            </p>
          </footer>
        </>
      ) : (
        <>
          <StudentPageLink
            href="/student/assignments"
            className="mb-2 inline-flex min-h-10 items-center text-sm font-medium underline underline-offset-4"
          >
            查看作业
          </StudentPageLink>
          {classProgress}
        </>
      )}
    </section>
  );
}
