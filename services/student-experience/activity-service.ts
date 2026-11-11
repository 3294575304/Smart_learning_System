import "server-only";

import { getStudentAttendance } from "@/services/attendance/service";
import { listStudentAssignmentPage } from "@/services/assignments/student-list";
import { studentAssignmentListQuerySchema } from "@/services/assignments/schemas";
import {
  getStudentClassroomContext,
  getStudentCourseContext,
} from "@/services/courses/student-access";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";
import {
  courseSurveyAvailability,
  nextCourseSurveyChangeAt,
} from "@/services/course-surveys/availability";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import type { StudentTaskItem } from "@/services/dashboard/student-task-overview";
import { listStudentExams } from "@/services/exams/service";
import {
  activityHref,
  activityPage,
  activityPageSize,
  type ActivityQuery,
  type ActivityStatus,
  type ActivityView,
} from "./activity-query";
import { attendanceSignInState, studentAssignmentState } from "./task-policy";
import { studentTaskHref } from "./task-scope";

type RowStatus = Exclude<ActivityStatus, "ALL">;
export type ActivityItem = {
  id: string;
  kind: StudentTaskItem["kind"];
  title: string;
  courseName: string | null;
  classroomName: string;
  status: RowStatus | "READ_ONLY";
  startsAt: Date | null;
  dueAt: Date | null;
  href: string;
};

function byStatus<T extends { status: RowStatus }>(
  items: T[],
  query: ActivityQuery,
) {
  return items.filter(
    (item) => query.status === "ALL" || item.status === query.status,
  );
}

export async function loadActivityTasks(
  studentId: string,
  query: ActivityQuery,
  now = new Date(),
) {
  const { courseId, classroomId } = query;
  const overview = await getStudentTaskOverview(studentId, now, {
    courseId,
    classroomId,
  });
  const pending = overview.pendingItems.map((item) => ({
    ...item,
    status: "TODO" as const,
    startsAt: item.opensAt ?? null,
  }));
  const upcoming = [
    ...overview.items.flatMap((item) =>
      item.status === "UPCOMING" && item.opensAt
        ? [{ ...item, status: "UPCOMING" as const, startsAt: item.opensAt }]
        : [],
    ),
    ...overview.scheduledSurveys.map((survey) => ({
      ...survey,
      kind: "survey" as const,
      status: "UPCOMING" as const,
      startsAt: survey.opensAt,
      dueAt: null,
      action: "查看安排",
      state: "待开放",
    })),
  ].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id),
  );
  const rows = byStatus([...pending, ...upcoming], query).filter(
    (item) => query.kind === "ALL" || item.kind === query.kind,
  );
  return {
    ...activityPage(rows, query.page),
    counts: overview.counts,
    nextChangeAt: overview.nextChangeAt,
  };
}

export async function loadActivityExams(
  studentId: string,
  query: ActivityQuery,
  now = new Date(),
) {
  const { courseId, classroomId } = query;
  if (classroomId)
    await getStudentClassroomContext(studentId, classroomId, courseId);
  else if (courseId) await getStudentCourseContext(studentId, courseId);
  const exams = await listStudentExams(studentId, { courseId, classroomId });
  const rows = exams.flatMap((exam) =>
    exam.assignments.flatMap((assignment) => {
      if (assignment.classroom.courseId !== exam.courseId) return [];
      const startsAt = new Date(
        Math.max(
          exam.startsAt.getTime(),
          assignment.publishedAt?.getTime() ?? 0,
        ),
      );
      const dueAt = new Date(
        Math.min(
          exam.endsAt.getTime(),
          assignment.dueAt?.getTime() ?? Infinity,
        ),
      );
      const writable =
        assignment.status === "PUBLISHED" &&
        assignment.classroom.status === "ACTIVE";
      const status: RowStatus = assignment.submissions.some(
        (s) => s.status !== "IN_PROGRESS",
      )
        ? "SUBMITTED"
        : !writable || now >= dueAt
          ? "EXPIRED"
          : now < startsAt
            ? "UPCOMING"
            : "TODO";
      const scope = {
        courseId: exam.courseId,
        classroomId: assignment.classroomId,
      };
      const href =
        status === "UPCOMING"
          ? `${activityHref("exams", query)}#exam-${assignment.id}`
          : studentTaskHref(`/student/assignments/${assignment.id}`, scope);
      return [
        {
          id: assignment.id,
          kind: "exam" as const,
          title: exam.title,
          courseName: exam.course.name,
          classroomName: assignment.classroom.name,
          status,
          startsAt,
          dueAt,
          href,
          examId: exam.id,
          examType: exam.type,
          allowedSwitches: exam.allowedSwitches,
          scope,
          canViewReport: now >= exam.endsAt,
        },
      ];
    }),
  );
  const nextChangeAt =
    rows
      .flatMap((row) => [row.startsAt, row.dueAt])
      .filter((date) => date > now)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const filtered = byStatus(rows, query);
  const targetIndex = query.focus
    ? filtered.findIndex((row) => row.id === query.focus)
    : -1;
  const page =
    targetIndex < 0
      ? query.page
      : Math.floor(targetIndex / activityPageSize) + 1;
  return { ...activityPage(filtered, page), nextChangeAt };
}

export async function loadActivityAssignments(
  studentId: string,
  query: ActivityQuery,
  now = new Date(),
) {
  return listStudentAssignmentPage(
    studentId,
    studentAssignmentListQuerySchema.parse(query),
    query.courseId,
    query.classroomId,
    now,
  );
}

export async function loadActivityAttendance(
  studentId: string,
  query: ActivityQuery,
  now = new Date(),
) {
  const data = await getStudentAttendance(
    studentId,
    query.courseId,
    query.classroomId,
  );
  const rows = data.records.map((record) => {
    const session = record.session;
    const window = attendanceSignInState(session, now);
    let status: RowStatus = "EXPIRED";
    if (session.status !== "CANCELLED") {
      if (
        record.signedAt ||
        ["PRESENT", "LATE", "EARLY_LEAVE"].includes(record.currentStatus)
      )
        status = "SUBMITTED";
      else if (record.currentStatus === "PENDING") {
        if (session.classroom.status === "ACTIVE" && window === "AVAILABLE")
          status = "TODO";
        else if (
          session.classroom.status === "ACTIVE" &&
          (window === "UPCOMING" || session.status === "SCHEDULED") &&
          session.signInClosesAt > now
        )
          status = "UPCOMING";
      }
    }
    return {
      id: record.id,
      kind: "attendance" as const,
      title: session.title,
      courseName: session.course.name,
      classroomName: session.classroom.name,
      status,
      startsAt: session.signInOpensAt,
      dueAt: session.signInClosesAt,
      href: activityHref("attendance", {
        courseId: session.course.id,
        classroomId: session.classroom.id,
      }),
      record,
    };
  });
  const nextChangeAt =
    rows
      .filter((row) => row.status === "TODO" || row.status === "UPCOMING")
      .flatMap((row) => [row.startsAt, new Date(row.dueAt.getTime() + 1)])
      .filter((date) => date > now)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return {
    ...activityPage(byStatus(rows, query), query.page),
    summary: data.summary,
    course: data.course,
    nextChangeAt,
  };
}

export async function loadActivitySurveys(
  studentId: string,
  query: ActivityQuery,
  now = new Date(),
) {
  const surveys = await listStudentCourseSurveys(
    studentId,
    query.courseId,
    query.classroomId,
  );
  const rows = surveys.map((survey) => {
    const availability = courseSurveyAvailability(survey, now);
    const status: RowStatus =
      availability === "OPEN"
        ? "TODO"
        : availability === "SCHEDULED"
          ? "UPCOMING"
          : availability === "SUBMITTED"
            ? "SUBMITTED"
            : "EXPIRED";
    return {
      id: survey.id,
      kind: "survey" as const,
      title: survey.title,
      courseName: survey.course.name,
      classroomName: survey.classroom.name,
      status,
      startsAt: survey.opensAt,
      dueAt: survey.dueAt,
      href: studentTaskHref(`/student/surveys/${survey.id}`, query),
      survey: { ...survey, availability, isOpen: availability === "OPEN" },
    };
  });
  return {
    ...activityPage(byStatus(rows, query), query.page),
    nextChangeAt: nextCourseSurveyChangeAt(surveys, now),
  };
}

function publicItem(item: ActivityItem): ActivityItem {
  const {
    id,
    kind,
    title,
    courseName,
    classroomName,
    status,
    startsAt,
    dueAt,
    href,
  } = item;
  return {
    id,
    kind,
    title,
    courseName,
    classroomName,
    status,
    startsAt,
    dueAt,
    href,
  };
}

export async function listStudentActivity(
  view: ActivityView,
  studentId: string,
  query: ActivityQuery,
  now = new Date(),
) {
  if (view === "assignments") {
    const result = await loadActivityAssignments(studentId, query, now);
    return {
      pagination: result.pagination,
      nextChangeAt: null,
      items: result.items.map((assignment) => {
        const state = studentAssignmentState(assignment, now);
        const status: ActivityItem["status"] =
          state === "SUBMITTED"
            ? "SUBMITTED"
            : state === "EXPIRED"
              ? "EXPIRED"
              : assignment.canWrite === false
                ? "READ_ONLY"
                : "TODO";
        const path =
          state === "SUBMITTED" && assignment.latestSubmissionId
            ? `/student/submissions/${assignment.latestSubmissionId}/result`
            : `/student/assignments/${assignment.id}`;
        return publicItem({
          id: assignment.id,
          kind: "assignment",
          title: assignment.title,
          courseName: null,
          classroomName: assignment.classroomName,
          status,
          startsAt: assignment.publishedAt,
          dueAt: assignment.dueAt,
          href: studentTaskHref(path, query),
        });
      }),
    };
  }
  const result =
    view === "tasks"
      ? await loadActivityTasks(studentId, query, now)
      : view === "exams"
        ? await loadActivityExams(studentId, query, now)
        : view === "surveys"
          ? await loadActivitySurveys(studentId, query, now)
          : await loadActivityAttendance(studentId, query, now);
  return {
    items: result.items.map(publicItem),
    pagination: result.pagination,
    nextChangeAt: result.nextChangeAt,
  };
}
