import { Role } from "@prisma/client";
import { CalendarCheck, ClipboardCheck, ClipboardList } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { getStudentAttendance } from "@/services/attendance/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listStudentAssignments } from "@/services/assignments/service";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";

export default async function StudentTasksPage() {
  const student = await requirePageRole(Role.STUDENT);
  const [assignments, attendance, surveys] = await Promise.all([
    listStudentAssignments(student.id),
    getStudentAttendance(student.id),
    listStudentCourseSurveys(student.id),
  ]);
  const now = new Date();
  const assignmentItems = assignments.filter(
    (assignment) => assignment.dueAt > now && !assignment.latestSubmissionId,
  );
  const attendanceItems = attendance.records.filter(
    (record) =>
      record.session.status === "OPEN" && record.currentStatus === "PENDING",
  );
  const surveyItems = surveys.filter(
    (survey) => survey.isOpen && !survey.submittedAt,
  );
  const pendingAssignments = assignmentItems.length;
  const pendingAttendance = attendanceItems.length;
  const pendingSurveys = surveyItems.length;
  const tasks = [
    {
      href: "/student/assignments?status=ALL",
      label: "课程作业",
      count: pendingAssignments,
      items: assignmentItems.slice(0, 3).map((assignment) => ({
        id: assignment.id,
        title: assignment.title,
        detail: `${assignment.classroomName} · 截止 ${assignment.dueAt.toLocaleString("zh-CN")}`,
        href: `/student/assignments/${encodeURIComponent(assignment.id)}`,
      })),
      detail: "查看各门课程的作业进度，继续作答或查看已提交记录。",
      action: "查看作业",
      icon: ClipboardList,
    },
    {
      href: "/student/attendance",
      label: "签到与出勤",
      count: pendingAttendance,
      items: attendanceItems
        .sort(
          (left, right) =>
            left.session.startsAt.getTime() - right.session.startsAt.getTime(),
        )
        .slice(0, 3)
        .map((record) => ({
          id: record.id,
          title: record.session.title,
          detail: `${record.session.course.name} · ${record.session.classroom.name} · ${record.session.startsAt.toLocaleString("zh-CN")}`,
          href: `/student/attendance?courseId=${encodeURIComponent(record.session.course.id)}`,
        })),
      detail: "集中处理课堂签到，并查看各门课程的出勤记录。",
      action: "查看出勤",
      icon: CalendarCheck,
    },
    {
      href: "/student/surveys",
      label: "课程问卷",
      count: pendingSurveys,
      items: surveyItems.slice(0, 3).map((survey) => ({
        id: survey.id,
        title: survey.title,
        detail: `${survey.course.name} · 截止 ${survey.dueAt.toLocaleString("zh-CN")}`,
        href: `/student/surveys/${encodeURIComponent(survey.id)}`,
      })),
      detail: "填写已开放的课程自评问卷；问卷不计入课程成绩。",
      action: "查看问卷",
      icon: ClipboardCheck,
    },
  ];
  const totalPending = pendingAssignments + pendingAttendance + pendingSurveys;

  return (
    <section className="space-y-6">
      <PageHeader
        description="把各门课程需要处理的作业、签到和问卷放在一起，查看进度后再进入对应课程。"
        title="学习任务"
      />
      <p className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-3 text-sm text-slate-700">
        当前有 <strong>{totalPending}</strong>{" "}
        项待处理任务。课程任务也可以从「我的课程」进入对应课程查看。
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {tasks.map((task) => {
          const Icon = task.icon;
          return (
            <article
              className="flex min-w-0 flex-col rounded-xl border bg-white p-5"
              key={task.href}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Icon aria-hidden="true" className="size-5 text-sky-700" />
                  <h2 className="font-semibold">{task.label}</h2>
                </div>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-800">
                  {task.count} 项待处理
                </span>
              </div>
              <p className="mt-3 flex-1 text-sm leading-6 text-gray-600">
                {task.detail}
              </p>
              {task.items.length ? (
                <ul className="mt-4 space-y-3 border-t pt-3">
                  {task.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        className="text-sm font-medium text-sky-800 hover:underline"
                        href={item.href}
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {item.detail}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 border-t pt-3 text-sm text-gray-500">
                  当前没有待处理事项。
                </p>
              )}
              <Link
                className="mt-5 inline-flex w-fit rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-700 focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                href={task.href}
              >
                {task.action}
              </Link>
            </article>
          );
        })}
      </div>
    </section>
  );
}
