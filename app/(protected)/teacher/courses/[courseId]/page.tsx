import { CourseStatus, Role } from "@prisma/client";
import { School, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CourseClassroomManager } from "@/components/courses/course-classroom-manager";
import { CourseForm } from "@/components/courses/course-form";
import { CourseStudentRosterImportCard } from "@/components/courses/course-student-roster-import-card";
import { CourseSyllabusCard } from "@/components/courses/course-syllabus-card";
import { CourseSyllabusReviewPanel } from "@/components/courses/course-syllabus-review-panel";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { ResourceNotFoundError } from "@/services/auth/authorization";
import { requirePageRole } from "@/services/auth/page-authorization";
import { courseIdSchema } from "@/services/courses/schemas";
import { getTeacherCourse } from "@/services/courses/service";

interface PageProps {
  params: Promise<{ courseId: string }>;
}

const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  DRAFT: "草稿",
  ACTIVE: "启用",
  ARCHIVED: "归档",
};

const COURSE_STATUS_STYLES: Record<CourseStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

export default async function TeacherCourseDetailPage({ params }: PageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const { courseId } = await params;
  const parsedId = courseIdSchema.safeParse(courseId);
  if (!parsedId.success) {
    notFound();
  }

  let course;
  try {
    course = await getTeacherCourse(teacher.id, parsedId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="rounded-md border bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
            href="/teacher/courses"
          >
            返回列表
          </Link>
        }
        description="查看课程基础信息、关联班级和基础统计。"
        title={course.name}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          hint="当前课程下所有已关联班级"
          icon={School}
          label="关联班级"
          value={course.linkedClassrooms.length}
        />
        <StatCard
          hint="仍在启用状态的班级数量"
          icon={School}
          label="开课班级"
          value={course.activeClassroomCount}
        />
        <StatCard
          hint="所有关联班级的在读人数"
          icon={Users}
          label="学生人数"
          value={course.activeStudentCount}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="space-y-4">
          <div className="bg-card rounded-xl border p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">课程概览</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  课程号 {course.courseNo} · 学期 {course.term}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs ${COURSE_STATUS_STYLES[course.status]}`}
              >
                {COURSE_STATUS_LABELS[course.status]}
              </span>
            </div>
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-muted-foreground text-xs">模板</p>
                <p className="mt-1 font-medium">
                  {course.template.name}
                  <span className="text-muted-foreground ml-2 text-xs">
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

          <CourseSyllabusCard courseId={course.id} />
          <CourseSyllabusReviewPanel courseId={course.id} />

          <div className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">课程考核方案</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              从正式大纲生成考核项目、课程目标比例和评分标准，审核后发布版本。
            </p>
            <Link
              className="mt-4 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              href={`/teacher/courses/${course.id}/assessment-scheme`}
            >
              进入考核方案
            </Link>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">成绩与出勤台账</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              管理班级成绩项目、平台作业同步、模板导入、正式成绩和课程目标达成度。
            </p>
            <Link
              className="mt-4 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              href={`/teacher/courses/${course.id}/gradebook`}
            >
              进入成绩台账
            </Link>
            <Link
              className="mt-4 ml-2 inline-flex rounded-md border px-4 py-2 text-sm font-medium"
              href={`/teacher/courses/${course.id}/attendance`}
            >
              进入出勤台账
            </Link>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">课程画像与证据</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              查看班级概览、学生确定性画像、概念掌握度与原始评分证据。
            </p>
            <Link
              className="mt-4 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              href={`/teacher/courses/${course.id}/profiles`}
            >
              进入课程画像
            </Link>
          </div>

          <div className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">Python 课程知识图谱</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              基于已发布的正式大纲结构生成、审核并发布版本化图谱。
            </p>
            <Link
              className="mt-4 inline-flex rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
              href={`/teacher/courses/${course.id}/knowledge-graph`}
            >
              进入知识图谱
            </Link>
            <Link
              className="mt-4 ml-2 inline-flex rounded-md border px-4 py-2 text-sm font-medium"
              href={`/teacher/courses/${course.id}/question-mapping`}
            >
              批量题目映射
            </Link>
            <Link
              className="mt-4 ml-2 inline-flex rounded-md border px-4 py-2 text-sm font-medium"
              href={`/teacher/courses/${course.id}/teaching-progress`}
            >
              配置教学进度
            </Link>
          </div>

          <CourseStudentRosterImportCard
            courseId={course.id}
            linkedClassrooms={course.linkedClassrooms}
          />

          <div className="bg-card rounded-xl border p-5">
            <h2 className="font-semibold">编辑课程基础信息</h2>
            <p className="text-muted-foreground mt-1 mb-5 text-sm">
              这里只修改课程号、学期、名称和描述，不影响班级关联。
            </p>
            <CourseForm
              courseId={course.id}
              defaultValues={{
                courseNo: course.courseNo,
                term: course.term,
                name: course.name,
                description: course.description ?? "",
              }}
              mode="edit"
              template={course.template}
            />
          </div>
        </section>

        <CourseClassroomManager
          classrooms={course.classrooms}
          courseId={course.id}
          linkedClassrooms={course.linkedClassrooms}
        />
      </div>
    </section>
  );
}
