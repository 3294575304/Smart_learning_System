import { StudentPageLink } from "./student-page-link";
import React from "react";
import type { StudentClassAnalysis } from "@/services/dashboard/student-class-analytics";
import { studentEnrollmentLabel } from "@/services/courses/student-enrollment";

export function StudentAssignmentRings({
  classes,
}: {
  classes: StudentClassAnalysis[];
}) {
  return (
    <section
      aria-labelledby="home-assignment-progress"
      className="min-w-0 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5"
    >
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            id="home-assignment-progress"
            className="font-semibold text-slate-950"
          >
            各课程作业进展
          </h2>
          <p className="mt-1 text-xs text-slate-600">各班已开放的正式作业</p>
        </div>
        <StudentPageLink
          href="/student/assignments"
          className="inline-flex min-h-10 items-center rounded-lg bg-sky-50 px-3 text-sm font-medium text-sky-800 focus-visible:outline-2 focus-visible:outline-sky-700"
        >
          查看作业
        </StudentPageLink>
      </header>
      {classes.length ? (
        <div className="divide-y divide-slate-100">
          {classes.map((item) => {
            const parts = [
              { label: "已提交", count: item.submitted, color: "#0369a1" },
              {
                label: "未交未截止",
                count: item.unsubmitted - item.overdue,
                color: "#64748b",
              },
              { label: "逾期未交", count: item.overdue, color: "#be123c" },
            ];
            let offset = 0;
            return (
              <StudentPageLink
                key={item.classroom.id}
                href={`/student/assignments?${new URLSearchParams({ courseId: item.course.id, classroomId: item.classroom.id })}`}
                className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700"
              >
                <div className="relative size-14 shrink-0">
                  <svg
                    viewBox="0 0 120 120"
                    className="size-full -rotate-90"
                    role="img"
                    aria-label={`${studentEnrollmentLabel(item)}：${item.total ? parts.map((p) => `${p.label}${p.count}项`).join("，") : "暂无作业"}`}
                  >
                    <circle
                      cx="60"
                      cy="60"
                      r="47"
                      fill="none"
                      stroke="#e2e8f0"
                      strokeWidth="10"
                    />
                    {parts.map((p) => {
                      const share = item.total
                        ? (p.count / item.total) * 100
                        : 0;
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
                    <strong className="text-xs font-semibold text-slate-950 tabular-nums">
                      {item.total ? `${item.completion}%` : "—"}
                    </strong>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium [overflow-wrap:anywhere] text-slate-900">
                    {item.course.name} · {item.classroom.name}
                  </h3>
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                    {item.total ? (
                      <>
                        <span>
                          已交 {item.submitted}／共 {item.total} 项
                        </span>
                        {parts[1].count > 0 && (
                          <span>未交未截止 {parts[1].count}</span>
                        )}
                        {item.overdue > 0 && (
                          <span className="text-rose-700">
                            逾期未交 {item.overdue}
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
        <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">
          暂无在学课程，加入课程后可查看作业进展。
        </p>
      )}
    </section>
  );
}
