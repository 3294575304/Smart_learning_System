import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { TeacherResultsFilters } from "@/components/assignment-results/overview-filters";
import { TeacherCourseAnalyticsView } from "@/components/courses/teacher-course-analytics";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getTeacherCourseAnalytics } from "@/services/course-analytics/service";
import {
  teacherResultsOverviewQuerySchema,
  type TeacherResultsOverviewQuery,
} from "@/services/assignment-results/schemas";
import { listTeacherResultsOverview } from "@/services/assignment-results/service";
import { getTeacherReportingScope } from "@/services/assignment-results/scope";
import { REPORTING_SECTION_LABELS } from "@/services/assignments/reporting";
import { listTeacherCourses } from "@/services/courses/service";

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
    .pick({ courseId: true, classroomId: true, section: true })
    .safeParse({
      courseId: firstValue(rawQuery.courseId),
      classroomId: firstValue(rawQuery.classroomId),
      section: rawQuery.section,
    });
  if (!filters.success) notFound();
  const parsedQuery: TeacherResultsOverviewQuery = {
    ...filters.data,
    page: 1,
    pageSize: 5,
  };
  const now = new Date();
  const [classrooms, courses] = await Promise.all([
    getTeacherReportingScope(teacher.id, parsedQuery, now).catch(
      (error: unknown) => {
        if (error instanceof ResourceNotFoundError) notFound();
        throw error;
      },
    ),
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
  const classroomId = parsedQuery.classroomId;
  const query: TeacherResultsOverviewQuery = { ...parsedQuery, classroomId };
  const [recentResults, analytics] = await Promise.all([
    selectedCourse
      ? listTeacherResultsOverview(teacher.id, query, now)
      : Promise.resolve(null),
    selectedCourse
      ? getTeacherCourseAnalytics(teacher.id, selectedCourse.id, classroomId, {
          section: query.section,
          now,
        })
      : Promise.resolve(null),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        description="选择课程和班级查看学习证据、作业表现与近期作业。"
        title="学情分析"
      />
      <section
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
              ? `${selectedCourse.name} · ${selectedCourse.courseNo} · ${selectedCourse.term}${classroomId && selectedClassroom ? ` · ${selectedClassroom.name}` : " · 当前范围的全部班级"}`
              : "选择课程和班级查看学习证据、作业表现与近期作业。"}
            {selectedClassroom && !selectedClassroom.courseId
              ? " 当前班级未关联课程。"
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
        <TeacherResultsFilters
          key={JSON.stringify(query)}
          courses={courses}
          classrooms={classrooms}
          query={query}
          scopeChanged={rawQuery.scopeChanged === "1"}
        />
        <p className="text-xs leading-5 text-slate-500">
          作业统计范围：{REPORTING_SECTION_LABELS[query.section]}
          。按现有有效成员关系实时统计，未冻结历史名单；入班前已截止的作业也计入应交。已退出、移除成员的作答单独保留，不计入应交和缺交。课程运行概览与章节掌握度仍展示当前有效授课班级的学情。
        </p>
        {selectedCourse ? (
          <Link
            className="inline-block rounded-md border px-4 py-2 text-sm text-sky-700 hover:bg-sky-50"
            href={`/teacher/courses/${selectedCourse.id}`}
          >
            返回课程管理
          </Link>
        ) : null}
      </section>
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
