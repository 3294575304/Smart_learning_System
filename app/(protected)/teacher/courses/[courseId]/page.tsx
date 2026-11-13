import { TeacherBackLink } from "@/components/dashboard/teacher-back-link";
import { CourseStatus, Role } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  CourseQuestionTools,
  CourseSetupChecklist,
} from "@/components/courses/course-setup-checklist";
import { CourseWorkspaceNavigation } from "@/components/courses/course-workspace-navigation";
import { CourseForm } from "@/components/courses/course-form";
import { CourseDetailDisclosure } from "@/components/courses/course-detail-disclosure";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageContainer } from "@/components/ui/workspace";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import {
  getTeacherCourse,
  listTeacherQuestionCourseCategories,
} from "@/services/courses/service";
import { getTeacherCourseSetupProgress } from "@/services/courses/setup-service";

interface PageProps {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "启用",
  ARCHIVED: "归档",
};

const COURSE_STATUS_TONES: Record<CourseStatus, StatusTone> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  ARCHIVED: "neutral",
};

export default async function TeacherCourseDetailPage({
  params,
  searchParams,
}: PageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { courseId } = await params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    notFound();
  }

  let course;
  let setupProgress;
  let categories;
  try {
    [course, setupProgress, categories] = await Promise.all([
      getTeacherCourse(teacher.id, parsedId.data),
      getTeacherCourseSetupProgress(teacher.id, parsedId.data),
      listTeacherQuestionCourseCategories(teacher.id),
    ]);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    throw error;
  }

  const query = await searchParams;
  const requestedClassroomId = query.classroomId;
  if (
    requestedClassroomId !== undefined &&
    (typeof requestedClassroomId !== "string" ||
      !course.linkedClassrooms.some(
        (item) => item.id === requestedClassroomId && item.status === "ACTIVE",
      ))
  )
    notFound();
  return (
    <PageContainer density="compact" className="space-y-5">
      <div className="space-y-3">
        <PageHeader
          actions={
            <TeacherBackLink href="/teacher/courses">
              返回课程列表
            </TeacherBackLink>
          }
          description={`${course.courseNo} · ${course.term}`}
          title={course.name}
        />

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <StatusBadge tone={COURSE_STATUS_TONES[course.status]}>
            {COURSE_STATUS_LABELS[course.status]}
          </StatusBadge>
          <span>
            开课班级{" "}
            <strong className="text-foreground font-semibold tabular-nums">
              {course.activeClassroomCount}
            </strong>
          </span>
          <span>
            在读学生（去重）{" "}
            <strong className="text-foreground font-semibold tabular-nums">
              {setupProgress.activeStudentCount}
            </strong>
          </span>
        </div>
      </div>
      <CourseSetupChecklist courseId={course.id} progress={setupProgress} />
      <div className="space-y-4">
        <CourseWorkspaceNavigation
          key={course.id}
          courseId={course.id}
          initialClassroomId={
            typeof requestedClassroomId === "string"
              ? requestedClassroomId
              : undefined
          }
          classrooms={course.linkedClassrooms
            .filter((classroom) => classroom.status === "ACTIVE")
            .map(({ id, name }) => ({ id, name }))}
        />
        <CourseQuestionTools courseId={course.id} />
      </div>
      <CourseDetailDisclosure
        id="course-classrooms"
        title="授课班级"
        summary={`${course.linkedClassrooms.length} 个课程班级 · 按班级分别管理教学记录`}
        revealOnHash={false}
      >
        <p className="text-muted-foreground text-sm">
          在班级页面逐个创建班级、导入名单并管理已有班级。
        </p>
        <Link
          href={`/teacher/courses/${course.id}/classrooms`}
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
        >
          查看和创建班级
        </Link>
      </CourseDetailDisclosure>
      <CourseDetailDisclosure
        id="course-basics"
        title="课程信息与设置"
        summary={`${course.courseNo} · ${course.template.name}`}
      >
        <div className="bg-card scroll-mt-20 rounded-xl border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">课程概览</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                课程号 {course.courseNo} · 学期 {course.term}
              </p>
            </div>
            <StatusBadge tone={COURSE_STATUS_TONES[course.status]}>
              {COURSE_STATUS_LABELS[course.status]}
            </StatusBadge>
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-xs">模板</p>
              <p className="mt-1 font-medium">
                {course.template.name}
                <span className="text-muted-foreground mt-1 block text-xs break-all">
                  {course.template.code}
                </span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">版本</p>
              <p className="mt-1 font-medium">{course.template.version}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">创建时间</p>
              <p className="mt-1 font-medium">
                {course.createdAt.toLocaleString("zh-CN")}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">更新时间</p>
              <p className="mt-1 font-medium">
                {course.updatedAt.toLocaleString("zh-CN")}
              </p>
            </div>
          </div>
        </div>

        <details className="bg-card group rounded-xl border p-5">
          <summary className="cursor-pointer rounded-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4">
            编辑课程基础信息
          </summary>
          <p className="text-muted-foreground mt-1 mb-5 text-sm">
            这里只修改课程号、学期、名称和描述，不影响班级关联。
          </p>
          <CourseForm
            courseId={course.id}
            defaultValues={{
              courseNo: course.courseNo,
              questionCategoryId: course.questionCategoryId,
              term: course.term,
              name: course.name,
              description: course.description ?? "",
            }}
            mode="edit"
            categories={categories}
            template={course.template}
          />
        </details>
      </CourseDetailDisclosure>
    </PageContainer>
  );
}
