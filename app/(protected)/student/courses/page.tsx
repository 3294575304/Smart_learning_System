import { Role } from "@prisma/client";
import { ArrowRight } from "lucide-react";
import { StudentJoinClassroomButton } from "@/components/classrooms/student-join-classroom-button";
import { StudentCourseFilters } from "@/components/courses/student-course-filters";
import { StudentPageLink } from "@/components/dashboard/student-page-link";
import { requirePageRole } from "@/services/auth/page-authorization";
import { studentEnrollmentStatus } from "@/services/courses/student-enrollment";
import { listStudentCourseProgress } from "@/services/dashboard/student-course-progress";

export default async function StudentCoursesPage() {
  const student = await requirePageRole(Role.STUDENT);
  const enrollments = await listStudentCourseProgress(student.id);
  const courses = enrollments.map(
    ({ course, classroom, assignmentProgress }) => {
      const { readOnly, label } = studentEnrollmentStatus(
        course.status,
        classroom.status,
      );
      const { total, submitted } = assignmentProgress;
      const ratio = total ? submitted / total : null;
      const percent = ratio === null ? null : Math.round(ratio * 100);
      const query = new URLSearchParams({
        courseId: course.id,
        classroomId: classroom.id,
      });
      return {
        id: classroom.id,
        readOnly,
        ratio,
        searchText: [course.name, classroom.name, course.courseNo ?? ""],
        card: (
          <article className="st-course-card group border-border bg-card hover:border-brand/55 relative isolate flex min-w-0 flex-col overflow-hidden rounded-lg border transition-colors">
            <div className="st-course-cover border-border bg-muted text-foreground flex min-h-14 flex-wrap items-end justify-between gap-x-3 gap-y-1 border-b px-3 py-2 text-xs">
              <span className="min-w-0 font-mono [overflow-wrap:anywhere]">
                {course.courseNo ? `课程号 ${course.courseNo}` : "课程号未设置"}
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
        ),
      };
    },
  );
  const activeCount = courses.filter(({ readOnly }) => !readOnly).length;

  return (
    <section className="st-courses-page text-foreground @container mx-auto max-w-7xl min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-foreground text-2xl font-semibold">我的课程</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            共 {courses.length} 个教学班 · {activeCount} 个学习中
          </p>
        </div>
        <StudentJoinClassroomButton />
      </header>
      <StudentCourseFilters courses={courses} activeCount={activeCount} />
    </section>
  );
}
