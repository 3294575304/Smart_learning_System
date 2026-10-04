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

const assignmentStatusLabel: Record<string, string> = {
  DRAFT: "草稿",
  PUBLISHED: "进行中",
  CLOSED: "已结束",
};

const surveyStatusLabel: Record<string, string> = {
  DRAFT: "草稿",
  SCHEDULED: "待开始",
  PUBLISHED: "收集中",
  CLOSED: "已结束",
};

function displayPercent(value: number | null) {
  return value === null ? "证据不足" : value + "%";
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
}: {
  data: TeacherCourseAnalytics;
}) {
  const courseBase = "/teacher/courses/" + data.course.id;

  return (
    <div className="space-y-6">
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

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-emerald-700">班级学情</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                掌握情况与需要关注的知识点
              </h2>
            </div>
            <Link
              href={courseBase + "/profiles"}
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

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm shadow-slate-100 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">近期作业</h2>
            <Link
              href="/teacher/assignments"
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
                    <span className="block">
                      {assignmentStatusLabel[assignment.status] ??
                        assignment.status}
                    </span>
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
                当前课程还没有作业。
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
              href={courseBase + "/quality-report"}
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
