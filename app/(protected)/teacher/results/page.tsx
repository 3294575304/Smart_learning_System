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
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/dashboard/empty-state";
import {
  PageContainer,
  SectionPanel,
  ScopeSummary,
} from "@/components/ui/workspace";

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
    <PageContainer density="compact">
      <PageHeader
        description="选择课程和班级查看学习证据、作业与考试表现。"
        title="学情分析"
      />
      <SectionPanel label="学情筛选与统计范围" className="space-y-4">
        <div className="min-w-0">
          <ScopeSummary label="当前分析范围">
            {selectedCourse
              ? `${selectedCourse.name} · ${selectedCourse.courseNo} · ${selectedCourse.term}${classroomId && selectedClassroom ? ` · ${selectedClassroom.name}` : " · 当前范围的全部班级"}`
              : "选择课程和班级查看学习证据、作业与考试表现。"}
            {selectedClassroom && !selectedClassroom.courseId
              ? " 当前班级未关联课程。"
              : ""}
          </ScopeSummary>
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
        <details className="rounded-lg border p-3">
          <summary className="text-brand-strong cursor-pointer text-sm font-medium">
            统计口径 · 在线任务：{REPORTING_SECTION_LABELS[query.section]}
            ；章节掌握度：当前有效教学班
          </summary>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            在线任务统计范围：{REPORTING_SECTION_LABELS[query.section]}
            。作业与已结束考试按现有有效成员关系实时统计，未冻结历史名单；入班前已截止的任务也计入应交。已退出、移除成员的作答单独保留，不计入应交和缺交。仅台账录入的考试参与成绩分析，不计提交率。章节掌握度仍展示当前有效授课班级的学情。
          </p>
        </details>
        {selectedCourse ? (
          <Link
            className="inline-block rounded-md border px-4 py-2 text-sm text-sky-700 hover:bg-sky-50"
            href={`/teacher/courses/${selectedCourse.id}`}
          >
            返回课程管理
          </Link>
        ) : null}
      </SectionPanel>
      {analytics ? (
        <TeacherCourseAnalyticsView
          data={analytics}
          classroomId={classroomId}
          recentAssignments={recentResults?.items ?? []}
        />
      ) : (
        <EmptyState
          icon={BarChart3}
          title={courses.length ? "请选择课程查看学情" : "暂无可分析的课程"}
          description={
            courses.length
              ? "选择上方课程，可进一步限定教学班和当前、历史范围。"
              : "先创建课程并关联教学班，再查看学习证据与成绩表现。"
          }
        />
      )}
    </PageContainer>
  );
}
