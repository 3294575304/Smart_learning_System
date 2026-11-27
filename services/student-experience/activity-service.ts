import "server-only";
import { cache } from "react";

import { examAttemptAvailability } from "@/services/exams/attempt-policy";
import { getStudentAttendance } from "@/services/attendance/service";
import { listStudentAssignmentPage } from "@/services/assignments/student-list";
import { studentAssignmentListQuerySchema } from "@/services/assignments/schemas";
import {
  getStudentClassroomHistoryContext,
  getStudentCourseHistoryContext,
  listStudentTaskClassrooms,
} from "@/services/courses/student-access";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";
import {
  courseSurveyAvailability,
  nextCourseSurveyChangeAt,
} from "@/services/course-surveys/availability";
import { getStudentTaskOverview } from "@/services/dashboard/student-task-service";
import type { StudentTaskItem } from "@/services/dashboard/student-task-overview";
import { listStudentExams } from "@/services/exams/service";
import { loadStudentExamLedger } from "@/services/exams/student-exam-result";
import {
  deriveExamRowState,
  examScoreView,
  examSpecialStatusLabel,
  examStateGroupLabels,
  examStateGroupOrder,
  isExamSpecialStatus,
  latestEffectiveAttempt,
  type ExamRowState,
  type ExamSpecialStatus,
} from "@/services/exams/exam-state";
import {
  activityHref,
  activityPage,
  activityPageSize,
  type ActivityQuery,
  type ActivityStatus,
  type ActivityView,
} from "./activity-query";
import { examTermKey } from "@/services/exams/exam-time";
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

const examStateToStatus: Record<ExamRowState, RowStatus> = {
  IN_PROGRESS: "TODO",
  RETAKEABLE: "TODO",
  SCORED_RETAKEABLE: "TODO",
  UPCOMING: "UPCOMING",
  AWAITING_SCORE: "AWAITING",
  SCORED: "SUBMITTED",
  SPECIAL: "SPECIAL",
  CLOSED_NO_SUBMISSION: "CLOSED",
};

function matchesExamStatus(state: ExamRowState, status: ActivityStatus) {
  switch (status) {
    case "ALL":
      return true;
    case "TODO":
      return (
        state === "IN_PROGRESS" ||
        state === "RETAKEABLE" ||
        state === "SCORED_RETAKEABLE"
      );
    case "UPCOMING":
      return state === "UPCOMING";
    case "SUBMITTED":
      return state === "SCORED";
    case "AWAITING":
      return state === "AWAITING_SCORE";
    case "CLOSED":
    case "EXPIRED":
      return state === "CLOSED_NO_SUBMISSION";
    case "SPECIAL":
      return state === "SPECIAL";
    default:
      return false;
  }
}

/** 进行中/可重考看截止、待开考看开考，其余按结束时间倒序。 */
function compareExamRows(
  a: { state: ExamRowState; startsAt: Date; dueAt: Date; id: string },
  b: { state: ExamRowState; startsAt: Date; dueAt: Date; id: string },
) {
  const group = examStateGroupOrder[a.state] - examStateGroupOrder[b.state];
  if (group) return group;
  const ascending =
    a.state === "IN_PROGRESS" ||
    a.state === "RETAKEABLE" ||
    a.state === "SCORED_RETAKEABLE" ||
    a.state === "UPCOMING";
  if (ascending) {
    const left = a.state === "UPCOMING" ? a.startsAt : a.dueAt;
    const right = b.state === "UPCOMING" ? b.startsAt : b.dueAt;
    if (left.getTime() !== right.getTime())
      return left.getTime() - right.getTime();
  } else if (a.dueAt.getTime() !== b.dueAt.getTime()) {
    return b.dueAt.getTime() - a.dueAt.getTime();
  }
  return a.id.localeCompare(b.id);
}

export const listStudentExamClassrooms = cache(
  (studentId: string, courseId?: string) =>
    listStudentTaskClassrooms(studentId, courseId, { includeHistory: true }),
);

export async function loadActivityExams(
  studentId: string,
  query: ActivityQuery,
  now = new Date(),
) {
  const { courseId, classroomId } = query;
  // 这里只校验「是否曾属于该教学班」，退课后仍可回看记录。
  const [, exams, ledger] = await Promise.all([
    classroomId
      ? getStudentClassroomHistoryContext(studentId, classroomId, courseId)
      : courseId
        ? getStudentCourseHistoryContext(studentId, courseId)
        : undefined,
    listStudentExams(studentId, { courseId, classroomId }),
    listStudentExamClassrooms(studentId, courseId).then((classrooms) =>
      loadStudentExamLedger(
        studentId,
        classrooms
          .filter(
            (room) =>
              room.courseName !== null &&
              (!classroomId || room.id === classroomId),
          )
          .map(({ id }) => id),
        now,
      ),
    ),
  ]);
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
      const membership = assignment.classroom.memberships[0] ?? null;
      const membershipStatus = membership?.status ?? "ACTIVE";
      const readOnly = membershipStatus !== "ACTIVE";
      const writable =
        assignment.status === "PUBLISHED" &&
        assignment.classroom.status === "ACTIVE" &&
        !readOnly;
      const latest = latestEffectiveAttempt(assignment.submissions);
      const ledgerEntry = ledger.get(assignment.id);
      const ledgerStatus = ledgerEntry?.status;
      const special: ExamSpecialStatus | null = isExamSpecialStatus(
        ledgerStatus,
      )
        ? ledgerStatus
        : null;
      const scoreView = examScoreView(ledgerEntry, latest);
      const { remainingAttempts, hasInProgress } = examAttemptAvailability(
        exam.allowedAttempts,
        assignment.submissions,
      );
      const state = deriveExamRowState({
        now,
        startsAt,
        dueAt,
        writable,
        special,
        graded: Boolean(scoreView),
        hasEffective: Boolean(latest),
        remainingAttempts,
      });
      // 只读档案只保留「留下过记录」的场次：退课后才开始的考试不应出现。
      if (readOnly && !latest && !special) return [];
      const scope = {
        courseId: exam.courseId,
        classroomId: assignment.classroomId,
      };
      const href =
        state === "UPCOMING"
          ? `${activityHref("exams", query)}#exam-${assignment.id}`
          : studentTaskHref(
              state === "IN_PROGRESS" || state === "RETAKEABLE"
                ? `/student/assignments/${assignment.id}`
                : `/student/exams/${exam.id}/record`,
              scope,
            );
      return [
        {
          id: assignment.id,
          kind: "exam" as const,
          title: exam.title,
          courseName: exam.course.name,
          classroomName: assignment.classroom.name,
          status: examStateToStatus[state],
          state,
          groupLabel: examStateGroupLabels[state],
          startsAt,
          dueAt,
          href,
          examId: exam.id,
          examType: exam.type,
          allowedSwitches: exam.allowedSwitches,
          autoSubmitOnExit: exam.autoSubmitOnExit,
          allowedAttempts: exam.allowedAttempts,
          remainingAttempts,
          hasInProgress,
          scope,
          readOnly,
          membershipStatus,
          score: scoreView
            ? {
                score: scoreView.score,
                maxScore: scoreView.maxScore,
                percentage: scoreView.percentage,
              }
            : null,
          specialLabel: examSpecialStatusLabel(special),
          attemptCount: assignment.submissions.filter(
            (attempt) => attempt.status !== "IN_PROGRESS",
          ).length,
          latestAttemptNumber: latest?.attemptNumber ?? null,
        },
      ];
    }),
  );
  const nextChangeAt =
    rows
      .filter(
        (row) =>
          row.state === "UPCOMING" ||
          row.state === "IN_PROGRESS" ||
          row.state === "RETAKEABLE",
      )
      .flatMap((row) => [row.startsAt, row.dueAt])
      .filter((date) => date > now)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const keyword = query.q?.toLowerCase();
  const currentTerm = examTermKey(now);
  const filtered = rows
    .filter(
      (row) =>
        query.range === "all" || examTermKey(row.startsAt) === currentTerm,
    )
    .filter((row) => matchesExamStatus(row.state, query.status))
    .filter(
      (row) => query.examType === "ALL" || row.examType === query.examType,
    )
    .filter((row) => !keyword || row.title.toLowerCase().includes(keyword))
    .sort(compareExamRows);
  const counts = filtered.reduce<Record<string, number>>((acc, row) => {
    acc[row.state] = (acc[row.state] ?? 0) + 1;
    return acc;
  }, {});
  const targetIndex = query.focus
    ? filtered.findIndex((row) => row.id === query.focus)
    : -1;
  const page =
    targetIndex < 0
      ? query.page
      : Math.floor(targetIndex / activityPageSize) + 1;
  return {
    ...activityPage(filtered, page),
    counts,
    total: filtered.length,
    nextChangeAt,
  };
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
