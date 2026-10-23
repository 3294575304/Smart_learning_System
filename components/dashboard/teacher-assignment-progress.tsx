"use client";

import { useState } from "react";
import { TeacherCardClassroomFilter } from "./teacher-card-classroom-filter";
import {
  summarizeAssignmentRates,
  summarizeAssignmentRatesByClass,
} from "@/services/dashboard/teacher-assignment-metrics";
import type { TeacherDashboardData } from "@/services/dashboard/teacher-dashboard";
import styles from "./teacher-workspace.module.css";

type Workspace = NonNullable<TeacherDashboardData["workspace"]>;
type ClassSummary = ReturnType<typeof summarizeAssignmentRatesByClass>[number];
const percent = (value: number | null) =>
  value === null ? "暂无数据" : `${value}%`;

function ClassRateBars({
  rows,
  kind,
}: {
  rows: ClassSummary[];
  kind: "completion" | "accuracy";
}) {
  const completion = kind === "completion";
  const totals = summarizeAssignmentRates(rows);
  const color = completion ? "#0d9488" : "#6366f1";
  const title = completion ? "作业完成率" : "作业正确率";
  const width = Math.max(300, rows.length * 86 + 42);
  const slot = (width - 46) / Math.max(1, rows.length);
  const barWidth = Math.min(38, slot * 0.48);
  const y = (value: number) => 148 - value * 1.12;
  return (
    <figure className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ background: color }}
          />
          {title}
        </span>
        <strong
          className="text-lg font-semibold tabular-nums"
          style={{ color }}
        >
          {percent(completion ? totals.completionRate : totals.accuracyRate)}
        </strong>
      </figcaption>
      <p className="mt-1 text-[11px] leading-5 text-slate-500">
        {completion
          ? `${totals.completedCount} / ${totals.expectedCount} 应交人次已提交`
          : `${totals.correctCount} / ${totals.judgedCount} 已判定题次答对`}
      </p>
      <div className={`${styles.scrollArea} mt-2 overflow-x-auto`}>
        <svg
          viewBox={`0 0 ${width} 202`}
          className="h-52 w-full"
          style={{ minWidth: rows.length > 3 ? width : undefined }}
          role="img"
          aria-label={`${title}，每根柱子代表一个班级所有已发布作业的汇总，纵轴0至100%`}
        >
          {[0, 25, 50, 75, 100].map((tick) => (
            <g key={tick}>
              <line
                x1="33"
                x2={width - 8}
                y1={y(tick)}
                y2={y(tick)}
                stroke="#e2e8f0"
                strokeDasharray={tick === 0 ? undefined : "3 4"}
              />
              <text
                x="27"
                y={y(tick) + 3}
                textAnchor="end"
                fontSize="9"
                fill="#94a3b8"
              >{`${tick}%`}</text>
            </g>
          ))}
          {rows.map((row, index) => {
            const value = completion ? row.completionRate : row.accuracyRate;
            const center = 36 + slot * (index + 0.5);
            const name =
              row.classroomName.length > 12
                ? `${row.classroomName.slice(0, 11)}…`
                : row.classroomName;
            return (
              <g key={row.classroomId}>
                <title>{`${row.classroomName}，${row.assignmentCount}份作业，${title}：${percent(value)}`}</title>
                {value !== null && (
                  <rect
                    x={center - barWidth / 2}
                    y={y(value)}
                    width={barWidth}
                    height={Math.max(0, value * 1.12)}
                    rx="4"
                    fill={color}
                    opacity="0.88"
                  />
                )}
                <text
                  x={center}
                  y={value === null ? 133 : y(value) - 7}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill={value === null ? "#94a3b8" : color}
                >
                  {value === null ? "暂无数据" : `${value}%`}
                </text>
                <text
                  x={center}
                  y="170"
                  textAnchor="middle"
                  fontSize="10"
                  fill="#475569"
                >
                  <tspan x={center}>{name.slice(0, 6)}</tspan>
                  {name.length > 6 && (
                    <tspan x={center} dy="14">
                      {name.slice(6)}
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="sr-only">
        {rows.map((row) => (
          <li key={row.classroomId}>
            {row.classroomName}：{row.assignmentCount}份作业，{title}
            {percent(completion ? row.completionRate : row.accuracyRate)}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function TeacherAssignmentProgress({
  workspace,
}: {
  workspace: Workspace;
}) {
  const [classroomId, setClassroomId] = useState("");
  const allClasses = summarizeAssignmentRatesByClass(
    workspace.classrooms,
    workspace.assignmentProgress,
  );
  const rows = allClasses.filter(
    (row) => !classroomId || row.classroomId === classroomId,
  );
  const assignmentCount = rows.reduce(
    (sum, row) => sum + row.assignmentCount,
    0,
  );
  return (
    <section
      aria-labelledby="assignment-progress-title"
      className={`${styles.card} order-3 min-w-0 border bg-white p-4 xl:order-none`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="assignment-progress-title"
          className={`${styles.heading} font-semibold`}
        >
          班级作业完成与正确情况
        </h2>
        <TeacherCardClassroomFilter
          label="作业图表班级"
          classrooms={workspace.classrooms}
          value={classroomId}
          onChange={setClassroomId}
        />
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        {classroomId ? rows[0]?.classroomName : "全部班级"} · 共{" "}
        {assignmentCount} 份已发布作业 · 每班汇总展示
      </p>
      {!assignmentCount ? (
        <div className="mt-3 flex min-h-48 items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500">
          当前范围暂无已发布作业
        </div>
      ) : (
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
          <ClassRateBars rows={rows} kind="completion" />
          <ClassRateBars rows={rows} kind="accuracy" />
        </div>
      )}
      <p className="mt-2 text-[11px] leading-5 text-slate-500">
        柱子表示各班全部作业的总体比例，右上角为所选范围的整体值；长班名可悬停查看。
      </p>
      <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
        <summary className="cursor-pointer font-medium text-teal-700">
          统计口径
        </summary>
        <p className="mt-2">
          每个班级汇总全部已发布、已关闭作业及当前在读成员。完成率＝已提交人次÷应交人次；正确率＝答对题次÷已判定题次。每人每份作业仅取最新有效提交，草稿、撤回记录不参与；部分得分但未完全答对按未答对统计，待批改和无题目任务不强行计为0%正确率。未截止作业也计入，暂无作业或判定数据时标明暂无数据。全部班级整体值按人次、题次总量汇总，不平均各班百分比。
        </p>
      </details>
    </section>
  );
}
