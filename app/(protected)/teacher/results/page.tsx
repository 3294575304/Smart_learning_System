import { Role } from "@prisma/client";
import Link from "next/link";

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

export default async function TeacherResultsPage({ searchParams }: Props) {
  const teacher = await requirePageRole(Role.TEACHER);
  const rawQuery = await searchParams;
  const filters = teacherResultsOverviewQuerySchema
    .pick({ courseId: true, classroomId: true })
    .safeParse({
      courseId: firstValue(rawQuery.courseId),
      classroomId: firstValue(rawQuery.classroomId),
    });
  if (!filters.success) notFound();
  const parsedQuery: TeacherResultsOverviewQuery = {
    ...filters.data,
    page: 1,
    pageSize: 5,
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
  const [recentResults, analytics] = await Promise.all([
    selectedCourse
      ? listTeacherResultsOverview(teacher.id, query)
      : Promise.resolve(null),
    selectedCourse
      ? getTeacherCourseAnalytics(teacher.id, selectedCourse.id, classroomId)
      : Promise.resolve(null),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        description="选择课程和班级查看学习证据、作业表现与近期作业。"
        title="学情分析"
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

      <form
        aria-labelledby="selected-course-learning-heading"
        className="space-y-4 rounded-xl border bg-white p-4"
      >
        <div className="min-w-0">
          <h2
            className="text-base font-semibold text-slate-900"
            id="selected-course-learning-heading"
          >
            课程学情分析
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {selectedCourse
              ? `${selectedCourse.name} · ${selectedCourse.courseNo} · ${selectedCourse.term}${classroomId && selectedClassroom ? ` · ${selectedClassroom.name}` : " · 全部有效授课班级"}`
              : "选择课程和班级查看学习证据、作业表现与近期作业。"}
            {selectedClassroom && !selectedClassroom.course
              ? " 当前班级未关联课程，因此这里只显示该班作业成绩。"
              : ""}
          </p>
          {!courses.length ? (
            <Link
              className="mt-2 inline-block text-sm font-medium text-sky-700 hover:underline"
              href="/teacher/courses"
            >
              创建或关联课程 →
            </Link>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)_auto_auto] xl:items-end">
          <label className="min-w-0 space-y-1">
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
          <label className="min-w-0 space-y-1">
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
            className="justify-self-start rounded-md border px-4 py-2 text-sm xl:self-end"
            href="/teacher/results"
          >
            重置
          </Link>
          {selectedCourse ? (
            <Link
              className="justify-self-start rounded-md border px-4 py-2 text-sm text-sky-700 hover:bg-sky-50 xl:self-end"
              href={`/teacher/courses/${selectedCourse.id}`}
            >
              返回课程管理
            </Link>
          ) : null}
        </div>
      </form>

      {analytics ? (
        <TeacherCourseAnalyticsView
          data={analytics}
          classroomId={classroomId}
          recentAssignments={recentResults?.items ?? []}
        />
      ) : null}
    </section>
  );
}
