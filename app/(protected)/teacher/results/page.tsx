import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

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
import { getTeacherWorkbenchPreferences } from "@/services/dashboard/teacher-settings";

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
  const now = new Date();
  const [courses, preferences] = await Promise.all([
    listTeacherCourses(teacher.id),
    getTeacherWorkbenchPreferences(teacher.id),
  ]);
  // 从左侧目录进入（没有显式课程/班级参数）时，默认带入「教师工作台」绑定的默认课程；
  // 显式选择「全部课程」（courseId=）或指定班级时保持原行为，不覆盖用户选择。
  const defaultCourseId =
    rawQuery.courseId === undefined && rawQuery.classroomId === undefined
      ? (courses.find((course) => course.id === preferences.defaultCourseId)
          ?.id ?? undefined)
      : undefined;
  // 左侧导航直接进入（地址没有显式课程）时不显示「返回课程管理」，避免给出不存在的上级入口；
  // 从课程工作台跳进来（?courseId=...）才展示。
  const enteredFromCourse = Boolean(firstValue(rawQuery.courseId));
  const parsedQuery: TeacherResultsOverviewQuery = {
    ...filters.data,
    courseId: filters.data.courseId ?? defaultCourseId,
    page: 1,
    pageSize: 5,
  };
  const classrooms = await getTeacherReportingScope(
    teacher.id,
    parsedQuery,
    now,
  ).catch((error: unknown) => {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  });
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
      ? listTeacherResultsOverview(teacher.id, query, now, true)
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
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="tt-h1">学情分析</h1>
          <p className="tt-sub">
            {selectedCourse
              ? `${selectedCourse.name} · ${selectedCourse.courseNo} · ${selectedCourse.term}${classroomId && selectedClassroom ? ` · ${selectedClassroom.name}` : " · 当前范围的全部班级"}`
              : "选择课程和班级查看学习证据、作业与考试表现。"}
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
      </header>
      <section
        aria-label="学情统计说明与课程入口"
        className="min-w-0 space-y-3"
      >
        <p className="text-xs leading-5 text-slate-500">
          在线任务统计范围：{REPORTING_SECTION_LABELS[query.section]}
          。作业与已结束考试按现有有效成员关系实时统计，未冻结历史名单；入班前已截止的任务也计入应交。已退出、移除成员的作答单独保留，不计入应交和缺交。仅台账录入的考试参与成绩分析，不计提交率。章节掌握度仍展示当前有效授课班级的学情。
        </p>
        {selectedCourse && enteredFromCourse ? (
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
