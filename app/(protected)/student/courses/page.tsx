import { Role } from "@prisma/client";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/dashboard/empty-state";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";

export default async function StudentCoursesPage() {
  const student = await requirePageRole(Role.STUDENT);
  const contexts = await listStudentCourseEvaluationContexts(student.id);
  return (
    <section className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">我的课程</h1>
          <p className="mt-1 text-sm text-slate-600">
            按教学班进入学习，同一课程的不同班级分别显示。
          </p>
        </div>
        <span className="text-sm text-slate-500">
          {contexts.length} 个教学班
        </span>
      </header>
      {contexts.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contexts.map(({ course, classroom }) => {
            const query = new URLSearchParams({
              courseId: course.id,
              classroomId: classroom.id,
            }).toString();
            const center = `/student/courses/${course.id}/learning-center?classroomId=${encodeURIComponent(classroom.id)}`;
            const archived =
              classroom.status === "ARCHIVED" || course.status === "ARCHIVED";
            return (
              <article
                key={classroom.id}
                className="flex min-w-0 flex-col rounded-2xl border border-sky-100 bg-white p-4 shadow-sm transition hover:border-sky-300 sm:p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-semibold text-slate-950">
                    {course.name}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs ${archived ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}
                  >
                    {archived ? "已归档" : "学习中"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium break-words text-sky-800">
                  {classroom.name}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {course.teacher.profile?.displayName ?? "授课教师"} ·{" "}
                  {course.term}
                </p>
                <p className="text-xs leading-5 text-slate-500">
                  课程号 {course.courseNo ?? "未设置"}
                </p>
                <Link
                  href={center}
                  className="mt-4 flex items-center justify-between rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
                >
                  进入教学班
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
                <nav
                  aria-label={`${classroom.name}快捷入口`}
                  className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"
                >
                  <Link
                    className="rounded-md border px-2 py-2 text-sky-700 hover:bg-sky-50"
                    href={`/student/assignments?${query}`}
                  >
                    作业
                  </Link>
                  <Link
                    className="rounded-md border px-2 py-2 text-sky-700 hover:bg-sky-50"
                    href={`/student/results?view=course&${query}`}
                  >
                    成绩与评价
                  </Link>
                  {!archived ? (
                    <Link
                      className="rounded-md border px-2 py-2 text-sky-700 hover:bg-sky-50"
                      href={`/student/recommendations?view=generate&${query}`}
                    >
                      自主练习
                    </Link>
                  ) : (
                    <span className="px-2 py-2 text-slate-400">已归档</span>
                  )}
                </nav>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={BookOpenCheck}
          title="暂未加入课程"
          description="从右上角个人中心输入教师提供的邀请码加入教学班后，课程会显示在这里。"
        />
      )}
    </section>
  );
}
