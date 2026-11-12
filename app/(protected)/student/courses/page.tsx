import { Role } from "@prisma/client";
import { ArrowRight, BookOpenCheck, Search } from "lucide-react";
import { StudentJoinClassroomButton } from "@/components/classrooms/student-join-classroom-button";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StudentPageLink } from "@/components/dashboard/student-page-link";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentEnrollmentStatus } from "@/services/courses/student-enrollment";
import { getStudentClassAnalytics } from "@/services/dashboard/student-class-analytics";

const tabs = [
  { id: "all", label: "全部" },
  { id: "active", label: "学习中" },
  { id: "ended", label: "已结束" },
] as const;

export default async function StudentCoursesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const [params, analytics] = await Promise.all([
    searchParams,
    getStudentClassAnalytics(student.id, {}),
  ]);
  const status =
    params.status === "active" || params.status === "ended"
      ? params.status
      : "all";
  const keyword =
    typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const sort = params.sort === "progress" ? "progress" : "default";
  const courses = analytics.classes.map((item) => {
    const { total, submitted } = item.assignmentProgress;
    return {
      ...item,
      ...studentEnrollmentStatus(item.course.status, item.classroom.status),
      ratio: total ? submitted / total : null,
    };
  });
  const activeCount = courses.filter((item) => !item.readOnly).length;
  const counts = {
    all: courses.length,
    active: activeCount,
    ended: courses.length - activeCount,
  };
  const needle = keyword.toLocaleLowerCase("zh-CN");
  const visible = courses.filter(
    ({ course, classroom, readOnly }) =>
      (status === "all" || (status === "ended" ? readOnly : !readOnly)) &&
      (!needle ||
        [course.name, classroom.name, course.courseNo].some((name) =>
          name?.toLocaleLowerCase("zh-CN").includes(needle),
        )),
  );
  if (sort === "progress")
    visible.sort((a, b) => (b.ratio ?? -1) - (a.ratio ?? -1));
  const href = (nextStatus: string, nextSort: string) =>
    "/student/courses?" +
    new URLSearchParams({ status: nextStatus, sort: nextSort, q: keyword });

  return (
    <section className="text-foreground @container mx-auto max-w-7xl min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">我的课程</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            共 {courses.length} 个教学班 · {activeCount} 个学习中
          </p>
        </div>
        <StudentJoinClassroomButton />
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <nav
          aria-label="课程状态"
          className="bg-muted flex flex-wrap gap-1 rounded-md p-1"
        >
          {tabs.map((tab) => (
            <StudentPageLink
              key={tab.id}
              href={href(tab.id, sort)}
              aria-current={status === tab.id ? "page" : undefined}
              className={`text-brand-strong focus-visible:outline-brand-strong inline-flex min-h-10 items-center gap-1 rounded px-2.5 text-sm focus-visible:outline-2 ${status === tab.id ? "bg-card font-semibold shadow-sm" : "hover:bg-card/70"}`}
            >
              {tab.label}{" "}
              <span className="text-xs tabular-nums">{counts[tab.id]}</span>
            </StudentPageLink>
          ))}
        </nav>
        <form
          action="/student/courses"
          className="flex min-w-0 flex-[1_1_16rem] flex-wrap gap-2"
        >
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="sort" value={sort} />
          <label className="border-border bg-card focus-within:ring-brand-strong flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border px-3 focus-within:ring-2">
            <Search
              aria-hidden="true"
              className="size-4 shrink-0 text-slate-500"
            />
            <span className="sr-only">搜索课程名、班级名或课程号</span>
            <input
              key={keyword}
              name="q"
              defaultValue={keyword}
              maxLength={120}
              placeholder="搜索课程名或班级名"
              className="w-full min-w-0 bg-transparent text-base outline-none sm:text-sm"
            />
          </label>
          <button
            type="submit"
            className="border-border bg-card focus-visible:outline-brand-strong min-h-11 rounded-md border px-3 text-sm focus-visible:outline-2"
          >
            搜索
          </button>
        </form>
        <StudentPageLink
          href={href(status, sort === "progress" ? "default" : "progress")}
          className="border-border bg-card focus-visible:outline-brand-strong inline-flex min-h-11 items-center rounded-md border px-3 text-sm focus-visible:outline-2"
        >
          {sort === "progress" ? "恢复默认排序" : "按进度排序"}
        </StudentPageLink>
      </div>
      {!visible.length && (
        <EmptyState
          icon={BookOpenCheck}
          title={courses.length ? "没有符合条件的教学班" : "暂未加入课程"}
          description={
            courses.length
              ? "调整课程状态或搜索词后再试。"
              : "使用教师提供的邀请码加入教学班。"
          }
        />
      )}
      <div className="grid gap-3 @min-[33rem]:grid-cols-2 @min-[54rem]:grid-cols-3">
        {visible.map(
          ({
            course,
            classroom,
            readOnly,
            label,
            ratio,
            assignmentProgress,
          }) => {
            const query = new URLSearchParams({
              courseId: course.id,
              classroomId: classroom.id,
            });
            const percent = ratio === null ? null : Math.round(ratio * 100);
            return (
              <article
                key={classroom.id}
                className="group border-border bg-card hover:border-brand/55 relative isolate flex min-w-0 flex-col overflow-hidden rounded-lg border transition-colors"
              >
                <div className="border-border bg-muted text-foreground flex min-h-14 flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b px-3 py-2 text-xs">
                  <span className="min-w-0 font-mono [overflow-wrap:anywhere]">
                    {course.courseNo
                      ? `课程号 ${course.courseNo}`
                      : "课程号未设置"}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-brand-strong inline-flex items-center gap-1 font-medium"
                  >
                    {readOnly ? "查看教学班" : "进入课程"}
                    <ArrowRight className="size-3.5" />
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <h2 className="font-semibold [overflow-wrap:anywhere]">
                    <StudentPageLink
                      href={`/student/courses/${course.id}/learning-center?classroomId=${encodeURIComponent(classroom.id)}`}
                      aria-label={`${readOnly ? "查看" : "进入"}教学班：${course.name} · ${classroom.name}`}
                      className="group-hover:text-brand-strong focus-visible:after:ring-brand rounded underline-offset-4 after:absolute after:inset-0 after:z-10 after:rounded-lg after:content-[''] focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-inset"
                    >
                      {course.name}
                    </StudentPageLink>
                  </h2>
                  <p className="text-foreground text-sm [overflow-wrap:anywhere]">
                    {classroom.name}
                  </p>
                  <p className="text-muted-foreground text-xs [overflow-wrap:anywhere]">
                    {course.term}
                    {course.teacher.profile?.displayName
                      ? ` · ${course.teacher.profile.displayName}`
                      : ""}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                    {percent === null ? (
                      <span className="text-muted-foreground flex-1 text-xs">
                        暂无作业
                      </span>
                    ) : (
                      <div className="flex min-w-0 flex-1 basis-28 items-center gap-2">
                        <progress
                          max={assignmentProgress.total}
                          value={assignmentProgress.submitted}
                          aria-label={`${classroom.name}作业进度，已交 ${assignmentProgress.submitted} 项，共 ${assignmentProgress.total} 项`}
                          className="bg-muted [&::-moz-progress-bar]:bg-brand [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-brand h-1.5 min-w-10 flex-1 appearance-none overflow-hidden rounded-full"
                        />
                        <span className="text-foreground text-xs tabular-nums">
                          作业 {percent}%
                        </span>
                      </div>
                    )}
                    <span
                      className={`rounded px-2 py-1 text-xs ${readOnly ? "bg-muted text-foreground" : "bg-brand/10 text-brand-strong"}`}
                    >
                      {label}
                    </span>
                  </div>
                  <StudentPageLink
                    href={`/student/analytics?${query}`}
                    className="text-brand-strong focus-visible:outline-brand-strong relative z-20 mt-1 inline-flex min-h-9 w-fit items-center rounded text-xs font-medium underline-offset-4 hover:underline focus-visible:outline-2"
                  >
                    我的学习分析
                  </StudentPageLink>
                </div>
              </article>
            );
          },
        )}
        {/* 已结束标签页只回顾历史教学班，不再提供加入入口 */}
        {status !== "ended" && <StudentJoinClassroomButton card />}
      </div>
    </section>
  );
}
