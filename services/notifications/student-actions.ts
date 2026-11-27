import "server-only";
import { prisma } from "@/lib/prisma";
import { studentAssignmentActionContexts } from "@/services/assignments/student-list";
import {
  attendanceSignInState,
  studentAssignmentState,
} from "@/services/student-experience/task-policy";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import { courseSurveyAvailability } from "@/services/course-surveys/availability";
import { availableStudentExamReports } from "@/services/exams/student-report";
import { EFFECTIVE_SUBMISSION_STATUSES } from "@/services/assignments/reporting";
import { notificationActionUrlSchema, notificationIdSchema } from "./schemas";
import type { NotificationListItem, StudentNotificationAction } from "./types";

export async function withStudentNotificationActions<
  T extends NotificationListItem,
>(
  recipientId: string,
  items: T[],
  now = new Date(),
): Promise<
  Array<
    T & { action?: StudentNotificationAction | null; actionMessage?: string }
  >
> {
  if (!items.length) return items;
  const user = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { role: true },
  });
  if (user?.role !== "STUDENT") return items;
  const ids = (type: string) =>
    items.flatMap((item) => {
      const id = notificationIdSchema.safeParse(item.sourceId);
      return item.sourceType === type && id.success ? [id.data] : [];
    });
  const submissionIds = ids("SUBMISSION");
  const surveyIds = ids("COURSE_SURVEY");
  const attendanceIds = ids("ATTENDANCE_SESSION");
  const [submissions, surveys, attendance] = await Promise.all([
    submissionIds.length
      ? prisma.submission.findMany({
          where: {
            id: { in: submissionIds },
            studentId: recipientId,
            status: { in: EFFECTIVE_SUBMISSION_STATUSES },
            assignment: {
              deletedAt: null,
              status: { in: ["PUBLISHED", "CLOSED", "ARCHIVED"] },
            },
          },
          select: { id: true, assignmentId: true, status: true },
        })
      : Promise.resolve([]),
    surveyIds.length
      ? prisma.courseSurvey.findMany({
          where: {
            id: { in: surveyIds },
            OR: [
              { status: "PUBLISHED" },
              {
                status: "CLOSED",
                participations: { some: { studentId: recipientId } },
              },
            ],
            classroom: {
              status: { in: ["ACTIVE", "COMPLETED"] },
              memberships: {
                some: { studentId: recipientId, status: "ACTIVE" },
              },
            },
          },
          select: {
            id: true,
            status: true,
            opensAt: true,
            dueAt: true,
            courseId: true,
            classroomId: true,
            classroom: { select: { courseId: true } },
            participations: {
              where: { studentId: recipientId },
              select: { submittedAt: true },
            },
          },
        })
      : Promise.resolve([]),
    attendanceIds.length
      ? prisma.attendanceSession.findMany({
          where: {
            id: { in: attendanceIds },
            records: { some: { studentId: recipientId } },
            classroom: {
              memberships: {
                some: { studentId: recipientId, status: "ACTIVE" },
              },
            },
          },
          select: {
            id: true,
            courseId: true,
            classroomId: true,
            status: true,
            signInOpensAt: true,
            signInClosesAt: true,
            classroom: { select: { courseId: true } },
            records: {
              where: { studentId: recipientId },
              select: { currentStatus: true },
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const assignmentIds = [
    ...new Set([
      ...ids("ASSIGNMENT"),
      ...submissions.map(({ assignmentId }) => assignmentId),
    ]),
  ];
  const [assignments, exams] = await Promise.all([
    studentAssignmentActionContexts(recipientId, assignmentIds, now),
    assignmentIds.length
      ? prisma.assignment.findMany({
          where: {
            id: { in: assignmentIds },
            deletedAt: null,
            status: { in: ["PUBLISHED", "CLOSED"] },
            examSession: { cancelledAt: null },
            classroom: {
              memberships: {
                some: { studentId: recipientId, status: "ACTIVE" },
              },
            },
          },
          select: {
            id: true,
            classroomId: true,
            status: true,
            title: true,
            publishedAt: true,
            dueAt: true,
            classroom: { select: { courseId: true, status: true } },
            examSession: {
              select: {
                id: true,
                courseId: true,
                startsAt: true,
                endsAt: true,
              },
            },
            submissions: {
              where: {
                studentId: recipientId,
                status: "PUBLISHED",
                score: { not: null },
                maxScore: { not: null },
              },
              select: { id: true },
              take: 1,
            },
          },
        })
      : Promise.resolve([]),
  ]);
  const examByAssignment = new Map(
    exams.flatMap((assignment) =>
      assignment.examSession &&
      assignment.examSession.courseId === assignment.classroom.courseId
        ? [
            [
              assignment.id,
              { ...assignment, exam: assignment.examSession },
            ] as const,
          ]
        : [],
    ),
  );
  const reports = await availableStudentExamReports(
    recipientId,
    [...examByAssignment.values()].map((assignment) => ({
      id: assignment.id,
      classroomId: assignment.classroomId,
      endsAt: assignment.exam.endsAt,
      hasPublishedScore: assignment.submissions.length > 0,
    })),
    now,
  );
  const byAssignment = new Map(
    assignments.map((context) => [context.assignment.id, context]),
  );
  const bySubmission = new Map(
    submissions.map((submission) => [submission.id, submission]),
  );
  const bySurvey = new Map(surveys.map((survey) => [survey.id, survey]));
  const byAttendance = new Map(
    attendance.map((session) => [session.id, session]),
  );
  return items.map((item) => {
    const resolved = (
      action: StudentNotificationAction | null,
      actionMessage?: string,
    ) => ({ ...item, action, actionMessage });
    if (item.expiresAt && new Date(item.expiresAt) <= now)
      return resolved(null, "通知已过期，请从课程记录查看最新状态。");
    if (item.type === "ATTENDANCE_PUBLISHED") {
      const session =
        item.sourceType === "ATTENDANCE_SESSION"
          ? byAttendance.get(item.sourceId ?? "")
          : undefined;
      if (!session || session.courseId !== session.classroom.courseId)
        return resolved(
          null,
          "相关签到当前不可查看，请从课程记录查看最新状态。",
        );
      if (session.status === "CANCELLED")
        return resolved(null, "教师已取消本次签到。");
      const canSign =
        session.records[0]?.currentStatus === "PENDING" &&
        attendanceSignInState(session, now) === "AVAILABLE";
      return resolved({
        kind: "LINK",
        href: studentTaskHref(`/student/attendance/${session.id}`, {
          courseId: session.courseId,
          classroomId: session.classroomId,
        }),
        label: canSign ? "前往签到" : "查看签到记录",
      });
    }
    if (
      item.type === "ASSIGNMENT_PUBLISHED" ||
      item.type === "ASSIGNMENT_DUE_SOON" ||
      item.type === "ASSIGNMENT_GRADED" ||
      item.type === "ASSIGNMENT_REVOKED"
    ) {
      const submitted =
        item.sourceType === "SUBMISSION"
          ? bySubmission.get(item.sourceId ?? "")
          : undefined;
      const assignmentId =
        submitted?.assignmentId ??
        (item.sourceType === "ASSIGNMENT" ? (item.sourceId ?? "") : "");
      const examAssignment = examByAssignment.get(assignmentId);
      if (examAssignment && item.type !== "ASSIGNMENT_REVOKED") {
        const { exam, classroomId, classroom, publishedAt, dueAt, status } =
          examAssignment;
        const scope = { courseId: exam.courseId, classroomId };
        const report = reports.has(assignmentId);
        const grading = item.type === "ASSIGNMENT_GRADED";
        const available =
          status === "PUBLISHED" &&
          classroom.status === "ACTIVE" &&
          publishedAt !== null &&
          now >= publishedAt &&
          now >= exam.startsAt &&
          now < exam.endsAt &&
          (!dueAt || now < dueAt);
        return {
          ...resolved({
            kind: "LINK",
            href: studentTaskHref(
              report
                ? `/student/exams/${exam.id}/report`
                : !grading && available
                  ? `/student/assignments/${assignmentId}`
                  : `/student/exams/${exam.id}/record`,
              scope,
            ),
            label: report
              ? "查看考试报告"
              : !grading && available
                ? "前往考试"
                : "查看考试记录",
          }),
          title: grading
            ? report
              ? "考试成绩已公布"
              : "考试已批改"
            : item.type === "ASSIGNMENT_DUE_SOON"
              ? "考试即将截止"
              : "考试已安排",
          content: grading
            ? `《${examAssignment.title}》已完成批改。${report ? "可以查看个人考试报告。" : "可以查看交卷记录。"}`
            : `查看《${examAssignment.title}》的考试安排。`,
        };
      }
      const context = byAssignment.get(assignmentId);
      if (!context && submitted)
        return resolved({
          kind: "LINK",
          href: `/student/submissions/${submitted.id}/result`,
          label: submitted.status === "PUBLISHED" ? "查看成绩" : "查看提交记录",
        });
      if (!context)
        return resolved(
          null,
          "相关作业当前不可操作，请从课程记录查看最新状态。",
        );
      const { assignment, courseId, classroomId } = context;
      const scope = { ...(courseId ? { courseId } : {}), classroomId };
      if (submitted)
        return resolved({
          kind: "LINK",
          href: studentTaskHref(
            `/student/submissions/${submitted.id}/result`,
            scope,
          ),
          label: submitted.status === "PUBLISHED" ? "查看成绩" : "查看提交记录",
        });
      const state = studentAssignmentState(assignment, now);
      if (
        assignment.canWrite &&
        (state === "PENDING" || state === "IN_PROGRESS")
      ) {
        if (assignment.inProgressSubmissionId)
          return resolved({
            kind: "LINK",
            href: studentTaskHref(
              `/student/submissions/${assignment.inProgressSubmissionId}/answer`,
              scope,
            ),
            label: "继续作答",
          });
        return resolved({
          kind: "START_ASSIGNMENT",
          assignmentId: assignment.id,
          ...scope,
          label: "开始作业",
        });
      }
      if (assignment.latestSubmissionId)
        return resolved({
          kind: "LINK",
          href: studentTaskHref(
            `/student/submissions/${assignment.latestSubmissionId}/result`,
            scope,
          ),
          label:
            assignment.latestSubmissionStatus === "PUBLISHED"
              ? "查看成绩"
              : "查看提交记录",
        });
      return resolved({
        kind: "LINK",
        href: studentTaskHref(`/student/assignments/${assignment.id}`, scope),
        label: "查看作业",
      });
    }
    if (item.type === "COURSE_SURVEY_PUBLISHED") {
      const survey =
        item.sourceType === "COURSE_SURVEY"
          ? bySurvey.get(item.sourceId ?? "")
          : undefined;
      if (!survey || survey.courseId !== survey.classroom.courseId)
        return resolved(
          null,
          "相关问卷当前不可查看，请从课程记录查看最新状态。",
        );
      const availability = courseSurveyAvailability(
        { ...survey, submittedAt: survey.participations[0]?.submittedAt },
        now,
      );
      return resolved({
        kind: "LINK",
        href: studentTaskHref(`/student/surveys/${survey.id}`, {
          courseId: survey.courseId,
          classroomId: survey.classroomId,
        }),
        label:
          availability === "OPEN"
            ? "填写问卷"
            : availability === "SUBMITTED"
              ? "查看填写状态"
              : "查看问卷安排",
      });
    }
    const url = notificationActionUrlSchema.safeParse(item.actionUrl);
    return resolved(
      url.success && url.data !== "/notifications"
        ? {
            kind: "LINK",
            href: url.data,
            label:
              item.type === "LEARNING_ANALYSIS_READY"
                ? "查看学习分析"
                : item.type === "RECOMMENDATION_READY"
                  ? "查看自主练习"
                  : "打开相关内容",
          }
        : null,
    );
  });
}
