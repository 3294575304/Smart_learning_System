import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  FileChartColumn,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";

import { CourseChapterMastery } from "@/components/courses/course-chapter-mastery";
import { CourseAttentionConcepts } from "@/components/courses/course-attention-concepts";
import type { TeacherResultOverviewItem } from "@/services/assignment-results/types";
import type { TeacherCourseAnalytics } from "@/services/course-analytics/service";
import { withClassroomQuery } from "@/lib/course-classroom";

const assignmentStatusLabel: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "进行中",
  CLOSED: "已结束",
};
const assignmentStatusColor: Record<string, string> = {
  DRAFT: "bg-amber-50 text-amber-700",
  PUBLISHED: "bg-emerald-50 text-emerald-700",
  CLOSED: "bg-slate-100 text-slate-600",
};

function displayPercent(value: number | null) {
  return value === null ? "证据不足" : value + "%";
}

function displayRate(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function displayDate(value: Date | string | null) {
  if (!value) return "未设置";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <article className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">
            {value}
          </p>
        </div>
        <span
          className={
            "flex size-10 items-center justify-center rounded-xl " + tone
          }
        >
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{detail}</p>
    </article>
  );
}

function DataCell({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl bg-sky-50/60 py-3 ${compact ? "px-3" : "px-4"}`}
    >
      <p
        className={`text-slate-500 ${compact ? "text-center text-[11px] whitespace-nowrap" : "text-xs"}`}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold text-slate-900 ${compact ? "text-center" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function trendDateLabel(value: Date | string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function formatChartScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function wrapAssignmentTitle(value: string, lineLength = 10) {
  const characters = Array.from(value);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += lineLength) {
    lines.push(characters.slice(index, index + lineLength).join(""));
  }
  return lines;
}

export function AssignmentScoreTrendChart({
  points,
}: {
  points: TeacherCourseAnalytics["assignmentScoreTrend"];
}) {
  const width = 760;
  const left = 88;
  const right = 88;
  const top = 26;
  const bottom = 242;
  const chartMaximum = 100;
  const plotWidth = width - left - right;
  const plotHeight = bottom - top;
  const maxTitleLines = Math.max(
    1,
    ...points.map((point) => wrapAssignmentTitle(point.title).length),
  );
  const height = bottom + 43 + maxTitleLines * 12;
  const chartPoints = points.map((point, index) => ({
    ...point,
    titleLines: wrapAssignmentTitle(point.title),
    description: `${point.title}：百分制平均分 ${formatChartScore(point.averageScore)} 分，最终评分 ${point.finalizedStudentCount}/${point.eligibleStudentCount} 名有效学生`,
    x:
      points.length === 1
        ? left + plotWidth / 2
        : left + (index / (points.length - 1)) * plotWidth,
    y: top + ((chartMaximum - point.averageScore) / chartMaximum) * plotHeight,
  }));
  const linePath = chartPoints.reduce((path, point, index) => {
    if (index === 0) return `M ${point.x} ${point.y}`;
    const previous = chartPoints[index - 1];
    if (!previous) return path;
    return `${path} L ${point.x} ${point.y}`;
  }, "");
  const yTicks = [0, 25, 50, 75, 100];
  const chartDescription = chartPoints
    .map((point) => point.description)
    .join("；");

  return (
    <div className="mt-4">
      <svg
        aria-label={`近几次作业百分制平均分折线图。${chartDescription}`}
        className="block h-auto w-full"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {yTicks.map((tick) => {
          const y = top + ((chartMaximum - tick) / chartMaximum) * plotHeight;
          return (
            <g key={tick}>
              <line
                stroke={tick === 0 ? "#cbd5e1" : "#e2e8f0"}
                strokeDasharray={tick === 0 ? undefined : "4 6"}
                strokeOpacity={tick === 0 ? 0.9 : 0.8}
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
              />
              <text
                fill="#64748b"
                fontSize="12"
                fontWeight="500"
                textAnchor="end"
                x={left - 12}
                y={y + 4}
              >
                {formatChartScore(tick)}分
              </text>
            </g>
          );
        })}
        {chartPoints.length > 1 ? (
          <path
            d={linePath}
            fill="none"
            stroke="#0284c7"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        ) : null}
        {chartPoints.map((point) => (
          <g key={point.assignmentId}>
            <title>{point.description}</title>
            <circle
              cx={point.x}
              cy={point.y}
              fill="white"
              r="4"
              stroke="#0284c7"
              strokeWidth="2"
            />
            <text
              fill="#64748b"
              fontSize="11"
              fontWeight="500"
              textAnchor="middle"
              x={point.x}
              y={bottom + 22}
            >
              {trendDateLabel(point.date)}
            </text>
            <text
              fill="#475569"
              fontSize="11"
              textAnchor="middle"
              y={bottom + 38}
            >
              {point.titleLines.map((line, lineIndex) => (
                <tspan
                  dy={lineIndex === 0 ? 0 : 12}
                  key={`${point.assignmentId}-${lineIndex}`}
                  x={point.x}
                >
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function ScoreDistribution({
  statistics,
}: {
  statistics: TeacherCourseAnalytics["assignmentStatistics"];
}) {
  return (
    <section
      aria-labelledby="student-score-distribution-heading"
      className="mt-auto border-t border-slate-100 pt-4"
    >
      <h3
        className="text-sm font-semibold text-slate-900"
        id="student-score-distribution-heading"
      >
        学生分数段分布
      </h3>
      <p className="mt-2 text-xs leading-5 text-slate-500">
        按每名学生已评分作业的平均得分率归档；未评分学生单列，占比以全部有效学生为准。
      </p>
      {statistics.studentCount === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          当前筛选范围暂无有效学生。
        </p>
      ) : statistics.assignmentCount === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          暂无已发布作业，暂时无法统计分数段。
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {statistics.scoreDistribution.map((band) => (
            <div
              aria-label={`${band.label}：${band.count} 人，占比 ${displayRate(band.ratio)}`}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_4.5rem_4.25rem] items-center gap-3 text-sm"
              key={band.key}
              role="img"
            >
              <span className="font-medium text-slate-700">{band.label}</span>
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
          {statistics.finalizedSubmissionCount === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              暂无最终评分；当前有效学生均计入“未评分”。
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function RecentAssignmentsPanel({
  assignments,
  allAssignmentsHref,
  statistics,
}: {
  assignments: TeacherResultOverviewItem[];
  allAssignmentsHref: string;
  statistics: TeacherCourseAnalytics["assignmentStatistics"];
}) {
  return (
    <section
      aria-labelledby="recent-assignments-heading"
      className="flex min-w-0 flex-col border-t border-slate-100 pt-5 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            className="text-xl font-semibold text-slate-900"
            id="recent-assignments-heading"
          >
            最近作业
          </h2>
        </div>
        <Link
          className="shrink-0 text-sm font-medium text-sky-700 hover:text-sky-900"
          href={allAssignmentsHref}
        >
          全部作业 →
        </Link>
      </div>
      <div className="mt-3 divide-y divide-slate-100">
        {assignments.length > 0 ? (
          assignments.slice(0, 5).map((assignment) => {
            const statusLabel =
              assignmentStatusLabel[assignment.status] ?? assignment.status;
            const statusColor =
              assignmentStatusColor[assignment.status] ??
              "bg-slate-100 text-slate-600";
            const classAndDeadline = `${assignment.classroom.name} · 截止 ${displayDate(assignment.dueAt)}`;
            const summary = `${classAndDeadline} · 提交 ${assignment.submittedCount}/${assignment.studentCount} 人 · 得分率 ${displayRate(assignment.averagePercentage)} · 已评 ${assignment.scoredStudentCount} 人 · 待批 ${assignment.pendingReviewCount}`;

            return (
              <Link
                aria-label={`查看${assignment.title}成绩详情；${summary}；${statusLabel}`}
                className="block px-2 py-2 hover:bg-sky-50/50"
                href={`/teacher/assignments/${assignment.id}/results`}
                key={assignment.id}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="min-w-0 flex-1 truncate text-[13px] leading-5 font-medium text-slate-900"
                    title={assignment.title}
                  >
                    {assignment.title}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] leading-4 ${statusColor}`}
                  >
                    {statusLabel}
                  </span>
                  <ArrowRight
                    aria-hidden="true"
                    className="size-3.5 shrink-0 text-slate-400"
                  />
                </span>
                <span
                  className="mt-0.5 block truncate text-xs leading-4 text-slate-500"
                  title={classAndDeadline}
                >
                  {classAndDeadline}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs leading-4 text-slate-600">
                  <span>
                    提交{" "}
                    <strong className="font-semibold text-sky-700 tabular-nums">
                      {assignment.submittedCount}/{assignment.studentCount} 人
                    </strong>
                  </span>
                  <span>
                    得分率{" "}
                    <strong className="font-semibold text-violet-700 tabular-nums">
                      {displayRate(assignment.averagePercentage)}
                    </strong>
                  </span>
                  <span>
                    已评{" "}
                    <strong className="font-semibold text-emerald-700 tabular-nums">
                      {assignment.scoredStudentCount} 人
                    </strong>
                  </span>
                  <span>
                    待批{" "}
                    <strong className="font-semibold text-orange-700 tabular-nums">
                      {assignment.pendingReviewCount}
                    </strong>
                  </span>
                </span>
              </Link>
            );
          })
        ) : (
          <p className="px-2 py-4 text-center text-xs text-slate-500">
            暂无已发布作业
          </p>
        )}
      </div>
      <ScoreDistribution statistics={statistics} />
    </section>
  );
}

export function TeacherCourseAnalyticsView({
  data,
  classroomId,
  recentAssignments,
}: {
  data: TeacherCourseAnalytics;
  classroomId?: string;
  recentAssignments: TeacherResultOverviewItem[];
}) {
  const courseBase = "/teacher/courses/" + data.course.id;
  const statistics = data.assignmentStatistics;
  const scoreTrend = data.assignmentScoreTrend;
  const assignmentParams = new URLSearchParams({ courseId: data.course.id });
  if (classroomId) assignmentParams.set("classroomId", classroomId);

  return (
    <div className="space-y-6">
      <section aria-labelledby="course-overview-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="course-overview-heading"
              className="text-xl font-semibold text-slate-900"
            >
              课程运行概览
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.overview.classroomCount} 个班级 · {data.overview.studentCount}{" "}
            名学生
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="教学进度"
            value={displayPercent(data.overview.teachingProgressRate)}
            detail={
              "已授 " +
              data.overview.taughtConceptCount +
              "/" +
              data.overview.totalConceptCount +
              " 个知识点"
            }
            icon={BookOpenCheck}
            tone="bg-emerald-50 text-emerald-700"
          />
          <MetricCard
            label="课程出勤率"
            value={displayPercent(data.overview.attendanceRate)}
            detail={
              data.overview.closedAttendanceSessionCount > 0
                ? "依据已结束的签到记录统计"
                : "尚无已结束的签到场次"
            }
            icon={CalendarCheck}
            tone="bg-teal-50 text-teal-700"
          />
          <MetricCard
            label="课程目标达成度"
            value={displayRate(data.overview.courseOutcomeAttainmentRate)}
            detail={
              data.overview.courseOutcomeAttainmentRate === null
                ? "暂无当前有效结果；生成正式达成度后显示"
                : `所有课程目标均达标 ${data.overview.courseOutcomeAttainedStudentCount}/${data.overview.studentCount} 人 · ${data.overview.courseOutcomeAttainmentClassroomCount}/${data.overview.classroomCount} 个班级有数据`
            }
            icon={Target}
            tone="bg-violet-50 text-violet-700"
          />
          <MetricCard
            label="近期活跃学生比例"
            value={displayRate(data.overview.recentActiveStudentRate)}
            detail={
              data.overview.studentCount > 0
                ? `近 7 日活跃 ${data.overview.recentActiveStudentCount}/${data.overview.studentCount} 人 · 作业、签到、练习或课程问答`
                : "当前筛选范围暂无有效学生"
            }
            icon={Activity}
            tone="bg-amber-50 text-amber-700"
          />
        </div>
      </section>

      <div className="grid items-stretch gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="flex flex-col rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-700">班级学情</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                章节掌握度
              </h2>
            </div>
            <Link
              href={withClassroomQuery(courseBase + "/profiles", classroomId)}
              className="text-sm font-medium text-sky-700 hover:text-sky-900"
            >
              查看课程画像 →
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DataCell
              label="课程平均掌握度"
              value={displayPercent(data.profiles.averageMastery)}
            />
            <DataCell
              label="稳定结论"
              value={String(data.profiles.conclusiveCount)}
            />
            <DataCell
              label="需重点关注"
              value={String(data.profiles.attentionStudentCount)}
            />
            <DataCell
              label="证据待积累"
              value={String(data.profiles.evidencePendingCount)}
            />
          </div>
          <CourseChapterMastery
            key={`${data.course.id}:${classroomId ?? "all"}`}
            chapters={data.chapterMastery}
            studentCount={data.overview.studentCount}
          />
        </section>

        <div className="flex min-w-0 flex-col justify-between gap-6">
          <CourseAttentionConcepts concepts={data.attentionConcepts} />
          <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-violet-700">
                  课程评价闭环
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  成绩、问卷与质量报告
                </h2>
              </div>
              <FileChartColumn
                aria-hidden="true"
                className="size-6 text-violet-500"
              />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <DataCell
                compact
                label="已发布台账"
                value={
                  data.overview.publishedGradebookCount +
                  "/" +
                  data.overview.gradebookCount
                }
              />
              <DataCell
                compact
                label="已结束问卷"
                value={String(data.overview.completedSurveyCount)}
              />
              <DataCell
                compact
                label="问卷答卷"
                value={String(data.overview.surveyResponseCount)}
              />
            </div>
            <div className="mt-4 grid gap-2">
              <Link
                href={withClassroomQuery(
                  courseBase + "/gradebook",
                  classroomId,
                )}
                className="flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm transition-colors hover:border-sky-300 hover:bg-sky-100"
              >
                <span className="font-medium text-sky-800">成绩台账</span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-sky-700"
                />
              </Link>
              <Link
                href={withClassroomQuery(courseBase + "/surveys", classroomId)}
                className="flex items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm transition-colors hover:border-teal-300 hover:bg-teal-100"
              >
                <span className="font-medium text-teal-800">结课问卷</span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-teal-700"
                />
              </Link>
              <Link
                href={withClassroomQuery(
                  courseBase + "/quality-report",
                  classroomId,
                )}
                className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm transition-colors hover:border-violet-300 hover:bg-violet-100"
              >
                <span className="font-medium text-violet-800">
                  课程质量报告
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-violet-700"
                />
              </Link>
            </div>
          </section>
        </div>
      </div>
      <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
        <div className="grid items-stretch gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,1fr)]">
          <section
            aria-labelledby="course-assignment-statistics-heading"
            className="min-w-0"
          >
            <div>
              <h2
                className="text-xl font-semibold text-slate-900"
                id="course-assignment-statistics-heading"
              >
                作业统计
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                统计已发布和已结束的教师作业；自主练习不计入。
              </p>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              {statistics.assignmentCount} 项作业 · {statistics.studentCount}{" "}
              名有效学生
            </p>
            {statistics.assignmentCount === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                <p className="font-medium text-slate-800">
                  暂无已发布或已结束作业
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  发布课程作业并产生最终评分后，这里会显示作业表现和平均得分走势。
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
                    当前筛选范围没有有效学生，暂时无法计算作业完成率和平均得分走势。
                  </p>
                ) : (
                  <section
                    className="mt-6"
                    aria-labelledby="score-trend-heading"
                  >
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <h3
                          className="font-semibold text-slate-900"
                          id="score-trend-heading"
                        >
                          近几次作业平均分
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          已统一换算为满分 100
                          分，展示已获最终评分学生的平均分；自主练习不计入。
                        </p>
                      </div>
                      <p className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700">
                        最近 {scoreTrend.length} 次有最终评分的作业
                      </p>
                    </div>
                    {scoreTrend.length > 0 ? (
                      <AssignmentScoreTrendChart points={scoreTrend} />
                    ) : (
                      <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                        暂无作业最终评分；评分完成后会显示平均得分走势。
                      </p>
                    )}
                    {scoreTrend.length === 1 ? (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        目前只有一次作业有最终评分，暂不足以观察变化趋势。
                      </p>
                    ) : null}
                    {scoreTrend.some(
                      (point) =>
                        point.finalizedStudentCount <
                        point.eligibleStudentCount,
                    ) ? (
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        每个数据点只统计已获最终评分的学生；悬停数据点可查看评分人数和有效学生数。
                      </p>
                    ) : null}
                  </section>
                )}
              </>
            )}
          </section>
          <RecentAssignmentsPanel
            allAssignmentsHref={`/teacher/assignments?${assignmentParams.toString()}`}
            assignments={recentAssignments}
            statistics={statistics}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm">
            <Sparkles aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-slate-900">
              本阶段教学待办
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              系统按课程建设、学习证据和结课评价的依赖顺序排列。
            </p>
          </div>
        </div>
        {data.nextActions.length > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {data.nextActions.map((action, index) => (
              <Link
                key={action.key}
                href={action.href}
                className="group flex gap-3 rounded-xl border border-white bg-white/90 p-4 shadow-sm transition hover:border-sky-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-semibold text-sky-700">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900">
                    {action.title}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-slate-500">
                    {action.detail}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="mt-1 size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700"
                />
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-white/90 p-4 text-sm text-emerald-800 shadow-sm">
            <CheckCircle2 aria-hidden="true" className="size-5" />
            当前课程关键环节均已完成，可继续观察学生学习变化。
          </div>
        )}
      </section>
    </div>
  );
}
