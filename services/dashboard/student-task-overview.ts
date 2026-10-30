import type { StudentAssignmentListItem } from "@/services/assignments/types";
import type { CourseSurveyStatus } from "@prisma/client";
import {
  courseSurveyAvailability,
  nextCourseSurveyChangeAt,
} from "@/services/course-surveys/availability";
import { studentAssignmentState } from "@/services/student-experience/task-policy";
import { studentTaskHref } from "@/services/student-experience/task-scope";

export type StudentTaskKind = "assignment" | "attendance" | "survey";
export type StudentTaskItem = {
  id: string;
  kind: StudentTaskKind;
  title: string;
  courseName: string | null;
  classroomName: string;
  dueAt: Date;
  href: string;
  action: string;
  state: string;
};
type Assignment = StudentAssignmentListItem & { canWrite?: boolean };
type AssignmentContext = {
  id: string;
  classroomId: string;
  classroom: { name: string; course: { id: string; name: string } | null };
};
type Survey = {
  id: string;
  title: string;
  status: CourseSurveyStatus;
  opensAt: Date;
  dueAt: Date;
  submittedAt: Date | null;
  course: { id: string; name: string };
  classroom: { id: string; name: string };
};
type Attendance = {
  id: string;
  session: {
    title: string;
    signInClosesAt: Date;
    course: { id: string; name: string };
    classroom: { id: string; name: string };
  };
};

export function pendingStudentAssignments(
  assignments: Assignment[],
  now: Date,
) {
  return assignments.filter(
    (assignment) =>
      assignment.canWrite !== false &&
      assignment.publishedAt <= now &&
      ["PENDING", "IN_PROGRESS"].includes(
        studentAssignmentState(assignment, now),
      ),
  );
}

export function summarizeStudentTasks(
  input: {
    assignments: Assignment[];
    contexts: AssignmentContext[];
    attendance: Attendance[];
    surveys: Survey[];
  },
  now: Date,
) {
  const contexts = new Map(input.contexts.map((item) => [item.id, item]));
  const items: StudentTaskItem[] = pendingStudentAssignments(
    input.assignments,
    now,
  ).flatMap((assignment) => {
    const context = contexts.get(assignment.id);
    if (!context) return [];
    const inProgress = Boolean(assignment.inProgressSubmissionId);
    return [
      {
        id: `assignment:${assignment.id}`,
        kind: "assignment" as const,
        title: assignment.title,
        courseName: context.classroom.course?.name ?? null,
        classroomName: context.classroom.name,
        dueAt: assignment.dueAt,
        href: studentTaskHref(
          inProgress
            ? `/student/submissions/${encodeURIComponent(assignment.inProgressSubmissionId ?? "")}/answer`
            : `/student/assignments/${encodeURIComponent(assignment.id)}`,
          {
            courseId: context.classroom.course?.id,
            classroomId: context.classroomId,
          },
        ),
        action: inProgress ? "继续作答" : "开始作业",
        state: inProgress ? "进行中" : "待完成",
      },
    ];
  });
  for (const record of input.attendance) {
    if (record.session.signInClosesAt < now) continue;
    items.push({
      id: `attendance:${record.id}`,
      kind: "attendance",
      title: record.session.title,
      courseName: record.session.course.name,
      classroomName: record.session.classroom.name,
      dueAt: record.session.signInClosesAt,
      href: studentTaskHref("/student/attendance", {
        courseId: record.session.course.id,
        classroomId: record.session.classroom.id,
      }),
      action: "去签到",
      state: "签到中",
    });
  }
  for (const survey of input.surveys) {
    if (courseSurveyAvailability(survey, now) !== "OPEN") continue;
    items.push({
      id: `survey:${survey.id}`,
      kind: "survey",
      title: survey.title,
      courseName: survey.course.name,
      classroomName: survey.classroom.name,
      dueAt: survey.dueAt,
      href: studentTaskHref(
        `/student/surveys/${encodeURIComponent(survey.id)}`,
        { courseId: survey.course.id, classroomId: survey.classroom.id },
      ),
      action: "填写问卷",
      state: "待完成",
    });
  }
  items.sort(
    (left, right) =>
      Number(right.kind === "attendance") -
        Number(left.kind === "attendance") ||
      left.dueAt.getTime() - right.dueAt.getTime() ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  );
  const scheduledSurveys = input.surveys
    .filter((survey) => courseSurveyAvailability(survey, now) === "SCHEDULED")
    .sort(
      (a, b) =>
        a.opensAt.getTime() - b.opensAt.getTime() || a.id.localeCompare(b.id),
    )
    .map((survey) => ({
      id: survey.id,
      title: survey.title,
      opensAt: survey.opensAt,
      courseName: survey.course.name,
      classroomName: survey.classroom.name,
      href: studentTaskHref(
        `/student/surveys/${encodeURIComponent(survey.id)}`,
        { courseId: survey.course.id, classroomId: survey.classroom.id },
      ),
    }));
  const changes = [
    nextCourseSurveyChangeAt(input.surveys, now),
    ...items.map((item) => item.dueAt),
  ].filter((date): date is Date => date !== null && date > now);
  return {
    items,
    total: items.length,
    counts: {
      assignment: items.filter((item) => item.kind === "assignment").length,
      attendance: items.filter((item) => item.kind === "attendance").length,
      survey: items.filter((item) => item.kind === "survey").length,
    },
    scheduledSurveys,
    nextChangeAt: changes.length
      ? changes.sort((a, b) => a.getTime() - b.getTime())[0]
      : null,
  };
}

export type StudentTaskOverview = ReturnType<typeof summarizeStudentTasks>;

export function studentTaskContext(task: {
  courseName: string | null;
  classroomName: string;
}) {
  return [task.courseName, task.classroomName].filter(Boolean).join(" · ");
}

export function studentTaskDate(date: Date) {
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
