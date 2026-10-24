import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  FileChartColumn,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import Link from "next/link";

import type { TeacherCourseAnalytics } from "@/services/course-analytics/service";
import { withClassroomQuery } from "@/lib/course-classroom";
import { REPORTING_SECTION_LABELS } from "@/services/assignments/reporting";

const surveyStatusLabel: Record<string, string> = {
  DRAFT: "草稿",
  SCHEDULED: "待开始",
  PUBLISHED: "收集中",
  CLOSED: "已结束",
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

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sky-50/60 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export function TeacherCourseAnalyticsView({
  data,
  classroomId,
}: {
  data: TeacherCourseAnalytics;
  classroomId?: string;
}) {
  const courseBase = "/teacher/courses/" + data.course.id;
  const statistics = data.assignmentStatistics;
  const assignmentParams = new URLSearchParams({ courseId: data.course.id });
  if (classroomId) assignmentParams.set("classroomId", classroomId);
  const assignmentSection =
    data.reportingSection === "ALL"
      ? data.reportingClassroomStatus &&
        data.reportingClassroomStatus !== "ACTIVE"
        ? "HISTORY"
        : "CURRENT"
      : data.reportingSection;
  assignmentParams.set("section", assignmentSection);
  const historyAssignmentParams = new URLSearchParams(assignmentParams);
  historyAssignmentParams.set("section", "HISTORY");
  const showCurrentTasks =
    data.reportingSection !== "HISTORY" &&
    (!data.reportingClassroomStatus ||
      data.reportingClassroomStatus === "ACTIVE");

  return (
    <div className="space-y-6">
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
              {REPORTING_SECTION_LABELS[data.reportingSection]}
              范围内实际已开放的教师作业；草稿、待开放作业和自主练习不计入。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 transition hover:bg-sky-50"
              href={`/teacher/assignments?${assignmentParams.toString()}`}
            >
              {assignmentSection === "HISTORY"
                ? "查看历史作业"
                : "查看当前作业"}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            {data.reportingSection === "ALL" &&
              assignmentSection === "CURRENT" && (
                <Link
                  className="inline-flex items-center rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
                  href={`/teacher/assignments?${historyAssignmentParams.toString()}`}
                >
                  查看历史作业
                </Link>
              )}
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-500">
          {statistics.assignmentCount} 项作业 · {statistics.studentCount}{" "}
          名有效学生
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          按现有有效成员关系实时统计；入班前已截止的作业也计入应交，历史退出成员的作答不计入完成率。
          {statistics.historicalSubmittedCount > 0
            ? ` 另保留 ${statistics.historicalSubmittedCount} 份历史成员有效提交。`
            : ""}
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
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  按最终评分的总得分 ÷ 总满分计算，待评分不记零。
                </p>
              </article>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              未交 {statistics.unsubmittedCount} 份 · 逾期未交{" "}
              {statistics.overdueCount} 份 · 待批改{" "}
              {statistics.pendingReviewCount} 份
            </p>
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
      </section>
      <p className="text-xs leading-5 text-slate-500">
        以下画像与教学进度沿用当前授课班级范围；出勤、问卷和报告沿用原有课程或指定班级口径，不随作业教学范围扩大。
      </p>
      <section aria-labelledby="course-overview-heading">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-sky-700">课程运行概览</p>
            <h2
              id="course-overview-heading"
              className="mt-1 text-xl font-semibold text-slate-900"
            >
              先看教学闭环，再处理当前任务
            </h2>
          </div>
          <p className="text-sm text-slate-500">
            {data.overview.classroomCount} 个班级 · {data.overview.studentCount}{" "}
            名学生
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="学生画像覆盖"
            value={displayPercent(data.profiles.coverageRate)}
            detail={
              data.profiles.snapshotCount +
              "/" +
              data.overview.studentCount +
              " 名学生已有画像快照"
            }
            icon={Users}
            tone="bg-sky-50 text-sky-700"
          />
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
            label="待批改提交"
            value={String(data.overview.pendingReviewCount)}
            detail={
              "已发布或结束的作业共 " +
              data.overview.publishedAssignmentCount +
              " 项"
            }
            icon={ClipboardCheck}
            tone="bg-amber-50 text-amber-700"
          />
        </div>
      </section>

      {showCurrentTasks && (
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
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-700">班级学情</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                掌握情况与需要关注的知识点
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
              label="平均掌握度"
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
          {data.weakConcepts.length > 0 ? (
            <div className="mt-5 space-y-3">
              {data.weakConcepts.slice(0, 5).map((concept) => (
                <div
                  key={concept.conceptId}
                  className="grid gap-2 rounded-xl border border-slate-100 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_7rem_5rem] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {concept.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {concept.code} · {concept.studentCount} 名学生有证据
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-sky-100/70">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{
                        width: Math.max(3, concept.averageMastery) + "%",
                      }}
                    />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 sm:text-right">
                    {concept.averageMastery}%
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0"
              />
              当前还没有可汇总的正式知识点证据。完成带知识点绑定的作业批改后，这里会显示班级薄弱知识点。
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-900">授课班级</h2>
          <p className="mt-1 text-sm text-slate-500">
            仅统计当前处于有效状态的学生成员。
          </p>
          <div className="mt-4 space-y-3">
            {data.classrooms.length > 0 ? (
              data.classrooms.map((classroom) => (
                <div
                  key={classroom.id}
                  className="flex items-center justify-between rounded-xl bg-sky-50/60 px-4 py-3"
                >
                  <span className="font-medium text-slate-800">
                    {classroom.name}
                  </span>
                  <span className="text-sm text-slate-500">
                    {classroom.studentCount} 人
                  </span>
                </div>
              ))
            ) : (
              <p className="rounded-xl bg-sky-50/60 p-4 text-sm text-slate-500">
                课程尚未关联有效班级。
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">近期作业</h2>
            <Link
              href={`/teacher/assignments?${assignmentParams.toString()}`}
              className="text-sm font-medium text-sky-700 hover:text-sky-900"
            >
              全部作业 →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {data.recentAssignments.length > 0 ? (
              data.recentAssignments.map((assignment) => (
                <Link
                  key={assignment.id}
                  href={
                    "/teacher/assignments/" + assignment.id + "/submissions"
                  }
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">
                      {assignment.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {assignment.classroomName} · 截止{" "}
                      {displayDate(assignment.dueAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    <span className="block">{assignment.displayStatus}</span>
                    {assignment.pendingReviewCount > 0 ? (
                      <span className="mt-1 block text-amber-700">
                        {assignment.pendingReviewCount} 份待批
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">
                当前教学范围没有实际已开放的作业。
              </p>
            )}
          </div>
        </section>

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
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <DataCell
              label="已发布成绩台账"
              value={
                data.overview.publishedGradebookCount +
                "/" +
                data.overview.gradebookCount
              }
            />
            <DataCell
              label="已结束问卷"
              value={String(data.overview.completedSurveyCount)}
            />
            <DataCell
              label="问卷答卷"
              value={String(data.overview.surveyResponseCount)}
            />
          </div>
          <div className="mt-4 space-y-3">
            {data.recentSurveys.slice(0, 1).map((survey) => (
              <Link
                key={survey.id}
                href={courseBase + "/surveys/" + survey.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">
                    {survey.title}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {survey.classroomName} · {survey.responseCount} 份答卷
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {surveyStatusLabel[survey.status] ?? survey.status}
                </span>
              </Link>
            ))}
            <Link
              href={withClassroomQuery(
                courseBase + "/quality-report",
                classroomId,
              )}
              className="flex items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm"
            >
              <span className="text-violet-900">
                {data.latestReport
                  ? "最新质量报告：第 " +
                    data.latestReport.versionNumber +
                    " 版 · " +
                    data.latestReport.reviewStatus
                  : "尚未生成教学质量报告"}
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
  );
}
