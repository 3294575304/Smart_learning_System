import { Role } from "@prisma/client";
import { hundredPointScore } from "@/services/assignments/presentation";
import { BarChart3, Eye } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageIndex } from "@/components/dashboard/page-index";
import { PageHeader } from "@/components/dashboard/page-header";
import { AutoSubmitSelect } from "@/components/filters/auto-submit-select";
import { TeacherCourseAnalyticsView } from "@/components/courses/teacher-course-analytics";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getTeacherCourseAnalytics } from "@/services/course-analytics/service";
import {
  teacherResultsOverviewQuerySchema,
  type TeacherResultsOverviewQuery,
} from "@/services/assignment-results/schemas";
import { listTeacherResultsOverview } from "@/services/assignment-results/service";
import { listTeacherClassrooms } from "@/services/classrooms/service";
import { listTeacherCourses } from "@/services/courses/service";
import { notFound } from "next/navigation";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function pageHref(query: TeacherResultsOverviewQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.courseId) params.set("courseId", query.courseId);
  if (query.classroomId) params.set("classroomId", query.classroomId);
  return `/teacher/results?${params.toString()}`;
}

function valueText(value: number | null, suffix = ""): string {
  return value === null ? "—" : `${value}${suffix}`;
}

export default async function TeacherResultsPage({ searchParams }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const rawQuery = await searchParams;
  const filters = teacherResultsOverviewQuerySchema
    .pick({ courseId: true, classroomId: true })
    .safeParse({
      courseId: rawQuery.courseId,
      classroomId: rawQuery.classroomId,
    });
  if (!filters.success) notFound();
  const paginationSchema = teacherResultsOverviewQuerySchema.pick({
    page: true,
    pageSize: true,
  });
  const pagination = paginationSchema.safeParse({
    page: firstValue(rawQuery.page),
    pageSize: firstValue(rawQuery.pageSize),
  });
  const parsedQuery: TeacherResultsOverviewQuery = {
    ...filters.data,
    ...(pagination.success ? pagination.data : paginationSchema.parse({})),
  };
  const [classrooms, courses] = await Promise.all([
    listTeacherClassrooms(teacher.id),
    listTeacherCourses(teacher.id),
  ]);
  const selectedCourse = parsedQuery.courseId
    ? (courses.find((course) => course.id === parsedQuery.courseId) ?? null)
    : null;
  if (parsedQuery.courseId && !selectedCourse) notFound();

  const selectedClassroom = parsedQuery.classroomId
    ? (classrooms.find(
        (classroom) => classroom.id === parsedQuery.classroomId,
      ) ?? null)
    : null;
  if (parsedQuery.classroomId && !selectedClassroom) notFound();

  const filterClassrooms = selectedCourse
    ? classrooms.filter(
        (classroom) =>
          classroom.course?.id === selectedCourse.id &&
          classroom.status === "ACTIVE",
      )
    : classrooms;
  const classroomId = filterClassrooms.some(
    (classroom) => classroom.id === parsedQuery.classroomId,
  )
    ? parsedQuery.classroomId
    : undefined;
  const query: TeacherResultsOverviewQuery = { ...parsedQuery, classroomId };
  const [results, analytics] = await Promise.all([
    listTeacherResultsOverview(teacher.id, query),
    selectedCourse
      ? getTeacherCourseAnalytics(teacher.id, selectedCourse.id, classroomId)
      : Promise.resolve(null),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        description="在同一页面查看作业成绩；选择课程和班级可查看对应的完成率、得分率与分数段。"
        title="成绩统计与学情分析"
      />
      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer font-medium">
          课程成绩台账 · {courses.length} 门课程
        </summary>
        <p className="mt-2 text-sm text-slate-500">
          作业成绩与课程总评分别维护；各班级使用独立台账，正式成绩保留发布版本。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {courses.map((course) => (
            <Link
              key={course.id}
              href={`/teacher/courses/${course.id}/gradebook`}
              className="rounded-lg border px-4 py-3 text-sm text-sky-700 hover:bg-sky-50"
            >
              {course.name} · {course.term} →
            </Link>
          ))}
        </div>
        {!courses.length && (
          <Link
            className="mt-3 block text-sm text-sky-700"
            href="/teacher/courses"
          >
            创建或关联课程
          </Link>
        )}
      </details>

      <form className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4">
        <label className="w-full space-y-1 sm:max-w-xs">
          <span className="text-xs font-medium">课程</span>
          <AutoSubmitSelect
            className="w-full rounded-md border px-3 py-2 text-sm"
            defaultValue={selectedCourse?.id ?? ""}
            name="courseId"
          >
            <option value="">全部课程</option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} · {course.term}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className="w-full space-y-1 sm:max-w-xs">
          <span className="text-xs font-medium">班级</span>
          <AutoSubmitSelect
            className="w-full rounded-md border px-3 py-2 text-sm"
            defaultValue={classroomId ?? ""}
            name="classroomId"
          >
            <option value="">全部班级</option>
            {filterClassrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <input name="pageSize" type="hidden" value={query.pageSize} />
        <Link
          className="rounded-md border px-4 py-2 text-sm"
          href="/teacher/results"
        >
          重置
        </Link>
      </form>

      {analytics ? (
        <section
          className="space-y-4"
          aria-labelledby="course-learning-heading"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="course-learning-heading"
                className="text-xl font-semibold text-slate-900"
              >
                {analytics.course.name} · 作业统计
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {analytics.course.courseNo} · {analytics.course.term}
                {classroomId && selectedClassroom
                  ? ` · ${selectedClassroom.name}`
                  : " · 全部有效授课班级"}
              </p>
            </div>
            <Link
              className="rounded-md border px-4 py-2 text-sm text-sky-700 hover:bg-sky-50"
              href={`/teacher/courses/${analytics.course.id}`}
            >
              返回课程管理
            </Link>
          </div>
          <TeacherCourseAnalyticsView
            data={analytics}
            classroomId={classroomId}
          />
        </section>
      ) : (
        <section
          aria-labelledby="course-learning-heading"
          className="rounded-xl border border-dashed bg-white p-5"
        >
          <h2
            id="course-learning-heading"
            className="font-semibold text-slate-900"
          >
            课程作业统计
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            选择一门课程查看该课程已发布作业的完成率、得分率和学生分数段。
            {selectedClassroom && !selectedClassroom.course
              ? " 当前班级未关联课程，因此这里只显示该班作业成绩。"
              : ""}
          </p>
          {!courses.length && (
            <Link
              className="mt-3 inline-block text-sm font-medium text-sky-700 hover:underline"
              href="/teacher/courses"
            >
              创建或关联课程 →
            </Link>
          )}
        </section>
      )}

      {results.items.length === 0 ? (
        <EmptyState
          action={
            <Link
              className="text-sm font-medium underline"
              href="/teacher/assignments"
            >
              查看作业管理
            </Link>
          }
          description="发布作业后，这里会显示真实的提交与成绩统计。"
          icon={BarChart3}
          title="暂无可统计作业"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-muted-foreground border-b bg-gray-50/70">
              <tr>
                <th className="px-5 py-3 font-medium">作业</th>
                <th className="px-4 py-3 font-medium">提交进度</th>
                <th className="px-4 py-3 font-medium">平均分（百分制）</th>
                <th className="px-4 py-3 font-medium">原始平均分 / 满分</th>
                <th className="px-4 py-3 font-medium">最高 / 最低（百分制）</th>
                <th className="px-4 py-3 font-medium">待处理</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {results.items.map((item) => (
                <tr className="border-b last:border-0" key={item.id}>
                  <td className="px-5 py-4">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {item.classroom.name}
                      {item.dueAt
                        ? ` · ${item.dueAt.toLocaleDateString("zh-CN")} 截止`
                        : ""}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    {item.submittedCount} / {item.studentCount}
                    {item.historicalSubmittedCount > 0 && (
                      <p className="mt-1 text-xs text-slate-500">
                        另有 {item.historicalSubmittedCount}{" "}
                        位已移出学生的历史提交
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {valueText(item.averagePercentage)}
                  </td>
                  <td className="px-4 py-4">
                    {valueText(item.averageScore)} / {item.totalPoints}
                  </td>
                  <td className="px-4 py-4">
                    {valueText(
                      hundredPointScore(item.highestScore, item.totalPoints),
                    )}{" "}
                    /{" "}
                    {valueText(
                      hundredPointScore(item.lowestScore, item.totalPoints),
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {item.pendingReviewCount > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">
                        {item.pendingReviewCount} 份
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <Link
                      aria-label={`查看${item.title}成绩详情`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-sky-200 bg-white px-2.5 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-50 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none sm:text-sm"
                      href={`/teacher/assignments/${item.id}/results`}
                      title="查看成绩详情"
                    >
                      <Eye aria-hidden="true" className="size-4" />
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {results.pagination.totalPages > 1 ? (
        <PageIndex
          ariaLabel="成绩统计分页"
          hrefForPage={(page) => pageHref(query, page)}
          page={results.pagination.page}
          totalPages={results.pagination.totalPages}
        />
      ) : null}
    </section>
  );
}
