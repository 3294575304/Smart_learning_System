import { Role } from "@prisma/client";
import { BookOpenCheck } from "lucide-react";
import Link from "next/link";
import { CourseForm } from "@/components/courses/course-form";
import { TeacherCourseList } from "@/components/courses/teacher-course-list";
import {
  CreateEntry,
  CreateEntryProvider,
} from "@/components/dashboard/create-entry";
import { EmptyState } from "@/components/dashboard/empty-state";
import { readAllowedParam, readTextParam } from "@/lib/list-filter";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listTeacherQuestionCourseCategories,
  listTeacherCourseTemplates,
  listTeacherCourses,
} from "@/services/courses/service";

const COURSE_STATUS_VALUES = ["ACTIVE", "DRAFT"] as const;

/** 副标题里的日期只要「月日」：课程列表看的是最近动作，不是长历史。 */
function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export default async function TeacherCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{
    keyword?: string;
    status?: string;
    term?: string;
  }>;
}) {
  const teacher = await requirePageRole(Role.TEACHER);
  const params = await searchParams;
  const [courses, templates, categories] = await Promise.all([
    listTeacherCourses(teacher.id),
    listTeacherCourseTemplates(teacher.id),
    listTeacherQuestionCourseCategories(teacher.id),
  ]);

  // 筛选条件从链接读回，保证刷新和分享链接能还原同一份结果
  const initialFilters = {
    keyword: readTextParam(params.keyword),
    status: readAllowedParam(params.status, COURSE_STATUS_VALUES),
    term: readTextParam(params.term, 40),
  };

  const defaultTemplateId =
    templates.find((template) => template.code === "python-programming-v1")
      ?.id ?? templates[0]?.id;
  const canCreate = templates.length > 0 && categories.length > 0;

  // 页头副标题：门数 / 进行中 / 最近一次改动，替代原来大段说明文字
  const activeCourseCount = courses.filter(
    (course) => course.status === "ACTIVE",
  ).length;
  const draftCourseCount = courses.length - activeCourseCount;
  const latestCourse = [...courses].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
  )[0];
  const summaryParts = [`共 ${courses.length} 门`];
  if (activeCourseCount > 0) summaryParts.push(`${activeCourseCount} 门进行中`);
  if (draftCourseCount > 0) summaryParts.push(`${draftCourseCount} 门草稿`);
  if (latestCourse) {
    summaryParts.push(
      `最近更新：${latestCourse.name} · ${formatMonthDay(latestCourse.updatedAt)}`,
    );
  }
  const summaryLine = summaryParts.join(" · ");

  return (
    <CreateEntryProvider
      title="创建课程"
      form={
        canCreate ? (
          <div className="space-y-4">
            <CourseForm
              defaultTemplateId={defaultTemplateId}
              mode="create"
              categories={categories}
              templates={templates}
            />
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-sm text-sky-800">
                查看模板说明
              </summary>
              <ul className="mt-2 space-y-2 text-sm text-slate-600">
                {templates.map((template) => (
                  <li key={template.id} className="rounded-lg bg-sky-50 p-3">
                    <strong className="text-slate-800">{template.name}</strong>
                    {" · 版本 "}
                    {template.version}
                    {template.description && <p>{template.description}</p>}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        ) : (
          <EmptyState
            compact
            description="请联系管理员启用课程模板和课程分类。"
            icon={BookOpenCheck}
            title={templates.length ? "暂无可用课程分类" : "暂无可用模板"}
          />
        )
      }
    >
      <section className="tc-course-page mx-auto w-full space-y-5">
        <header className="tt-phead">
          <div className="min-w-0">
            <h1 className="tt-h1">我的课程</h1>
            <p className="tt-sub">{summaryLine}</p>
          </div>
          <div className="tt-phead-act">
            <Link className="tt-btn-line" href="/teacher/classrooms">
              班级管理
            </Link>
            <CreateEntry tone="cta" />
          </div>
        </header>
        <TeacherCourseList
          initialCourses={courses}
          initialFilters={initialFilters}
          createEntry={<CreateEntry card />}
        />
      </section>
    </CreateEntryProvider>
  );
}
