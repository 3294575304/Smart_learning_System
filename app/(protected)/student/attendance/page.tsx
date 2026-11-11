import { SurveyAvailabilityRefresh } from "@/components/course-surveys/survey-availability-refresh";
import {
  StudentActivityFilters,
  StudentActivityPagination,
} from "@/components/dashboard/student-activity-list";
import {
  readActivityPage,
  readActivityPageQuery,
} from "@/services/student-experience/activity-page";
import { loadActivityAttendance } from "@/services/student-experience/activity-service";
import { StudentCourseReturnLink } from "@/components/dashboard/student-course-return-link";
import { StudentBackLink } from "@/components/dashboard/student-back-link";

import { listStudentTaskClassrooms } from "@/services/courses/student-access";
import { Role } from "@prisma/client";

import { StudentAttendanceView } from "@/components/attendance/student-attendance-view";
import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";

import { requirePageRole } from "@/services/auth/page-authorization";

export default async function StudentAttendancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = await searchParams;
  const query = readActivityPageQuery("attendance", raw);
  const { courseId, classroomId } = query;
  const data = await readActivityPage(() =>
    loadActivityAttendance(student.id, query),
  );
  const classrooms = (
    await listStudentTaskClassrooms(student.id, courseId)
  ).filter((item) => item.courseName !== null);
  return (
    <section className="space-y-4">
      <SurveyAvailabilityRefresh at={data.nextChangeAt?.toISOString()} />
      <PageHeader
        actions={
          courseId ? (
            <StudentCourseReturnLink
              courseId={courseId}
              classroomId={classroomId}
              tab="tasks"
            />
          ) : (
            <StudentBackLink href="/student/tasks">
              返回学习任务
            </StudentBackLink>
          )
        }
        title="签到与出勤"
        description={
          data.course
            ? `查看「${data.course.name}」的课堂签到、教师纠正记录和课程出勤率。`
            : "集中处理各门课程的课堂签到，并查看出勤记录、教师纠正记录和总体出勤率。"
        }
        eyebrow={data.course?.name}
      />
      <StudentActivityFilters
        view="attendance"
        query={query}
        classrooms={classrooms}
        total={data.pagination.total}
      />
      <StudentAttendanceView
        key={`${courseId ?? "all"}:${classroomId ?? "all"}`}
        initialRecords={data.items.map((row) => row.record)}
        rate={data.summary.rate}
        denominator={data.summary.denominator}
        classroomId={classroomId}
        courseId={courseId}
      />
      <StudentActivityPagination
        view="attendance"
        query={query}
        pagination={data.pagination}
      />
    </section>
  );
}
