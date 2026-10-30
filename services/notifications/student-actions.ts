import "server-only";
import { prisma } from "@/lib/prisma";
import { studentAssignmentActionContexts } from "@/services/assignments/student-list";
import { studentAssignmentState } from "@/services/student-experience/task-policy";
import { studentTaskHref } from "@/services/student-experience/task-scope";
import { courseSurveyAvailability } from "@/services/course-surveys/availability";
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
  const [submissions, surveys] = await Promise.all([
    submissionIds.length
      ? prisma.submission.findMany({
          where: {
            id: { in: submissionIds },
            studentId: recipientId,
            status: { not: "WITHDRAWN" },
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
  ]);
  const assignments = await studentAssignmentActionContexts(
    recipientId,
    [
      ...new Set([
        ...ids("ASSIGNMENT"),
        ...submissions.map((submission) => submission.assignmentId),
      ]),
    ],
    now,
  );
  const byAssignment = new Map(
    assignments.map((context) => [context.assignment.id, context]),
  );
  const bySubmission = new Map(
    submissions.map((submission) => [submission.id, submission]),
  );
  const bySurvey = new Map(surveys.map((survey) => [survey.id, survey]));
  return items.map((item) => {
    const resolved = (
      action: StudentNotificationAction | null,
      actionMessage?: string,
    ) => ({ ...item, action, actionMessage });
    if (item.expiresAt && new Date(item.expiresAt) <= now)
      return resolved(null, "通知已过期，请从课程记录查看最新状态。");
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
      const context = byAssignment.get(
        submitted?.assignmentId ??
          (item.sourceType === "ASSIGNMENT" ? (item.sourceId ?? "") : ""),
      );
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
      url.success
        ? { kind: "LINK", href: url.data, label: "打开相关内容" }
        : null,
    );
  });
}
