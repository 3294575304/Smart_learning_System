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
                  <h2 className="min-w-0 text-base font-semibold [overflow-wrap:anywhere] text-slate-950">
                    {course.name}
                  </h2>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-xs ${archived ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}
                  >
                    {archived ? "已归档" : "学习中"}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium [overflow-wrap:anywhere] break-words text-sky-800">
                  {classroom.name}
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {course.teacher.profile?.displayName ?? "授课教师"} ·{" "}
                  {course.term}
                </p>
                <p className="text-xs leading-5 text-slate-500">
                  课程号 {course.courseNo ?? "未设置"}
                </p>
                <nav
                  aria-label={`${classroom.name}课程入口`}
                  className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] gap-2 pt-4"
                >
                  <Link
                    href={center}
                    className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium whitespace-nowrap text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                  >
                    {archived ? "查看教学班" : "进入教学班"}
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0"
                    />
                  </Link>
                  <Link
                    href={`/student/analytics?${query}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium whitespace-nowrap text-sky-700 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                  >
                    学情分析
                  </Link>
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
