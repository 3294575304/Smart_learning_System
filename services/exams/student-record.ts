import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { EFFECTIVE_SUBMISSION_STATUSES } from "@/services/assignments/reporting";
import { examAttemptAvailability } from "./attempt-policy";
import { countedExamSwitchKinds } from "./switch-policy";
import { availableStudentExamReports } from "./student-report";
import { loadStudentExamLedger } from "./student-exam-result";
import {
  examScoreView,
  examSpecialStatusLabel,
  isExamSpecialStatus,
  latestEffectiveAttempt,
  type ExamSpecialStatus,
} from "./exam-state";

export async function getStudentExamRecord(
  studentId: string,
  examId: string,
  scope: { courseId?: string; classroomId?: string },
) {
  const rows = await prisma.assignment.findMany({
    where: {
      deletedAt: null,
      status: { in: ["PUBLISHED", "CLOSED"] },
      classroomId: scope.classroomId,
      classroom: {
        courseId: scope.courseId,
        // 退课/转班后仍保留只读记录；写权限由 membershipStatus 判定。
        memberships: { some: { studentId } },
      },
      examSession: { id: examId, cancelledAt: null, courseId: scope.courseId },
    },
    take: 2,
    select: {
      id: true,
      publishedAt: true,
      dueAt: true,
      classroomId: true,
      classroom: {
        select: {
          name: true,
          courseId: true,
          memberships: {
            where: { studentId },
            select: { status: true, endedAt: true, joinedAt: true },
            take: 1,
          },
        },
      },
      examSession: {
        select: {
          id: true,
          title: true,
          courseId: true,
          startsAt: true,
          endsAt: true,
          type: true,
          allowedAttempts: true,
          allowedSwitches: true,
          course: { select: { name: true } },
        },
      },
      // 预约公布成绩时，学生端可以看到预计公布时间。
      examPublication: {
        select: { mode: true, scheduledAt: true, completedAt: true },
      },
      submissions: {
        where: {
          studentId,
          status: { in: [...EFFECTIVE_SUBMISSION_STATUSES, "IN_PROGRESS"] },
        },
        orderBy: [{ attemptNumber: "desc" }, { id: "asc" }],
        select: {
          id: true,
          status: true,
          score: true,
          maxScore: true,
          attemptNumber: true,
          startedAt: true,
          submittedAt: true,
          lastSavedAt: true,
          examSubmissionReason: true,
        },
      },
    },
  });
  const row = rows.length === 1 ? rows[0] : undefined;
  if (!row?.examSession || row.classroom.courseId !== row.examSession.courseId)
    throw new ResourceNotFoundError("考试不存在或需要指定教学班");
  const { submissions, examPublication, ...record } = row;
  const membership = row.classroom.memberships[0] ?? null;
  const membershipStatus = membership?.status ?? "ACTIVE";
  const latest = latestEffectiveAttempt(submissions);
  const reports = await availableStudentExamReports(studentId, [
    {
      id: row.id,
      classroomId: row.classroomId,
      endsAt: row.examSession.endsAt,
      hasPublishedScore: submissions.some(
        (attempt) =>
          attempt.status === "PUBLISHED" &&
          attempt.score !== null &&
          attempt.maxScore !== null,
      ),
    },
  ]);
  const ledger = await loadStudentExamLedger(studentId, [row.classroomId]);
  const ledgerEntry = ledger.get(row.id);
  const specialStatus: ExamSpecialStatus | null =
    ledgerEntry && isExamSpecialStatus(ledgerEntry.status)
      ? ledgerEntry.status
      : null;
  const now = new Date();
  const scorePublishAt =
    examPublication &&
    !examPublication.completedAt &&
    examPublication.scheduledAt &&
    examPublication.scheduledAt > now
      ? examPublication.scheduledAt
      : null;
  const switchGroups = submissions.length
    ? await prisma.examSwitchEvent.groupBy({
        by: ["submissionId"],
        where: {
          submissionId: { in: submissions.map((attempt) => attempt.id) },
          kind: { in: [...countedExamSwitchKinds] },
        },
        _count: { _all: true },
      })
    : [];
  const switchByAttempt = new Map(
    switchGroups.map((group) => [group.submissionId, group._count._all]),
  );
  // 教师反馈按题统计：记录页据此标记「哪次答卷有反馈」。
  const feedbackRows = submissions.length
    ? await prisma.studentAnswer.findMany({
        where: {
          submissionId: { in: submissions.map((attempt) => attempt.id) },
          teacherFeedback: { not: null },
        },
        select: { submissionId: true, teacherFeedback: true },
      })
    : [];
  const feedbackByAttempt = new Map<string, number>();
  for (const row of feedbackRows) {
    if (!row.teacherFeedback?.trim()) continue;
    feedbackByAttempt.set(
      row.submissionId,
      (feedbackByAttempt.get(row.submissionId) ?? 0) + 1,
    );
  }
  const attempts = submissions.map((attempt) => ({
    ...attempt,
    switchCount: switchByAttempt.get(attempt.id) ?? 0,
    feedbackCount: feedbackByAttempt.get(attempt.id) ?? 0,
    elapsedMinutes: Math.max(
      0,
      Math.floor(
        ((attempt.submittedAt ?? now).getTime() - attempt.startedAt.getTime()) /
          60_000,
      ),
    ),
  }));
  return {
    ...record,
    canViewReport: reports.has(row.id),
    exam: row.examSession,
    ...examAttemptAvailability(
      row.examSession.allowedAttempts,
      row.submissions,
    ),
    startsAt: new Date(
      Math.max(
        row.examSession.startsAt.getTime(),
        row.publishedAt?.getTime() ?? 0,
      ),
    ),
    dueAt: new Date(
      Math.min(
        row.examSession.endsAt.getTime(),
        row.dueAt?.getTime() ?? Infinity,
      ),
    ),
    /** 交卷记录表：按作答序号倒序，最新一次在前。 */
    attempts,
    /** 最新一次有效作答（计分依据）。 */
    submission: latest,
    membershipStatus,
    membershipEndedAt: membership?.endedAt ?? null,
    /** 非在读成员一律只读：可查看，不可进入或继续作答。 */
    readOnly: membershipStatus !== "ACTIVE",
    scoreView: examScoreView(ledgerEntry, latest),
    ledgerStatus: ledgerEntry?.status ?? null,
    /** 预约公布时间：仅在尚未公布且已排期时给出。 */
    scorePublishAt,
    specialStatus,
    specialStatusLabel: examSpecialStatusLabel(specialStatus),
  };
}
