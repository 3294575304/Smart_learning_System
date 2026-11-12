import { Role } from "@prisma/client";
import { BookOpenCheck } from "lucide-react";
import { CourseForm } from "@/components/courses/course-form";
import { TeacherCourseList } from "@/components/courses/teacher-course-list";
import {
  CreateEntry,
  CreateEntryProvider,
} from "@/components/dashboard/create-entry";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { readAllowedParam, readTextParam } from "@/lib/list-filter";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  listTeacherQuestionCourseCategories,
  listTeacherCourseTemplates,
  listTeacherCourses,
} from "@/services/courses/service";

const COURSE_STATUS_VALUES = ["ACTIVE", "DRAFT"] as const;

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
      <section className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="课程管理"
          description="管理课程与授课班级。可按课程名称、课程号搜索，或按学期筛选。"
          actions={<CreateEntry />}
        />
        <TeacherCourseList
          initialCourses={courses}
          initialFilters={initialFilters}
          createEntry={<CreateEntry card />}
        />
      </section>
    </CreateEntryProvider>
  );
}
