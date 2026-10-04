import { Role } from "@prisma/client";
import {
  ArrowRight,
  BookOpenCheck,
  GitBranch,
  Sparkles,
  UserRound,
} from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentPracticeCourses } from "@/services/course-recommendations/service";
import { listStudentLearnerProfileCourses } from "@/services/learner-profiles/service";

export default async function StudentCoursesPage() {
  const student = await requirePageRole(Role.STUDENT);
  const [courses, practiceCourses] = await Promise.all([
    listStudentLearnerProfileCourses(student.id),
    listStudentPracticeCourses(student.id),
  ]);
  const practiceByCourseId = new Map(
    practiceCourses.map((course) => [course.courseId, course]),
  );

  return (
    <section className="space-y-6">
      <PageHeader
        description="从课程进入知识图谱、学习画像和自主练习，按教师当前教学进度安排学习。"
        eyebrow="Course learning"
        title="我的课程"
      />

      {courses.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {courses.map((course) => {
            const practice = practiceByCourseId.get(course.id);
            const graphVersion = practice?.graphVersionNumber ?? null;
            const taughtCount = practice?.concepts.length ?? 0;
            return (
              <article
                className="overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-100/60"
                key={course.id}
              >
                <div className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium tracking-wide text-sky-700 uppercase">
                        {course.courseNo ?? "课程"}
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-950">
                        {course.name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        {practice?.classroomName ?? "已加入课程班级"} ·{" "}
                        {course.term}
                      </p>
                    </div>
                    <span className="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs text-slate-600">
                      {graphVersion
                        ? `正式图谱 v${graphVersion}`
                        : "等待正式图谱"}
                    </span>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-sky-50/70 p-3">
                      <p className="text-xs text-slate-500">教学进度</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">
                        {taughtCount} 个知识点
                      </p>
                    </div>
                    <div className="rounded-xl bg-emerald-50/70 p-3">
                      <p className="text-xs text-slate-500">当前行动</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">
                        {taughtCount > 0
                          ? "查看状态并继续练习"
                          : "先浏览课程知识结构"}
                      </p>
                    </div>
                  </div>

                  <Link
                    className="mt-5 flex items-center justify-between rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                    href={`/student/courses/${course.id}/learning-center`}
                  >
                    进入课程学习中心
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Link>
                </div>

                <div className="grid grid-cols-3 border-t bg-sky-50/60">
                  <CourseLink
                    href={`/student/courses/${course.id}/knowledge-graph`}
                    icon={GitBranch}
                    label="知识图谱"
                  />
                  <CourseLink
                    href={`/student/courses/${course.id}/profile`}
                    icon={UserRound}
                    label="我的画像"
                  />
                  <CourseLink
                    href={`/student/recommendations?courseId=${course.id}`}
                    icon={Sparkles}
                    label="自主练习"
                  />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border bg-white p-5 sm:p-6">
          <EmptyState
            description="从右上角个人中心输入教师提供的邀请码，加入班级后课程会显示在这里。"
            icon={BookOpenCheck}
            title="暂时没有课程"
          />
        </div>
      )}
    </section>
  );
}

function CourseLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof GitBranch;
}) {
  return (
    <Link
      className="flex items-center justify-center gap-2 border-r px-2 py-3 text-xs text-slate-600 transition last:border-r-0 hover:bg-sky-100/70 hover:text-slate-950 sm:text-sm"
      href={href}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}
