import "server-only";

import { prisma } from "@/lib/prisma";
import {
  listPublishedExamScores,
  type PublishedExamScore,
} from "@/services/course-analytics/exam-scores";
import {
  EFFECTIVE_SUBMISSION_STATUSES,
  latestEffectiveSubmissions,
} from "@/services/assignments/reporting";
import { oneDecimal } from "./analysis-statistics";

export async function loadExamScoreContext(
  assignmentId: string,
  classroomId: string,
  studentIds: string[],
  now = new Date(),
) {
  const [submissions, ledger] = await Promise.all([
    prisma.submission.findMany({
      where: {
        assignmentId,
        studentId: { in: studentIds },
        status: { in: EFFECTIVE_SUBMISSION_STATUSES },
      },
      select: {
        id: true,
        assignmentId: true,
        studentId: true,
        attemptNumber: true,
        status: true,
        submittedAt: true,
        score: true,
        maxScore: true,
      },
    }),
    listPublishedExamScores([classroomId], undefined, now),
  ]);
  const latest =
    latestEffectiveSubmissions(submissions).get(assignmentId) ??
    new Map<string, (typeof submissions)[number]>();
  const ledgerByStudent = new Map(
    ledger
      .filter((row) => row.assignmentId === assignmentId)
      .map((row) => [row.studentId, row]),
  );
  const scoreFor = (studentId: string) => {
    const grade: PublishedExamScore | undefined =
      ledgerByStudent.get(studentId);
    if (grade)
      return grade.status === "SCORED" && grade.score !== null
        ? { score: grade.score, max: grade.maxScore }
        : null;
    const attempt = latest.get(studentId);
    return attempt?.status === "PUBLISHED" &&
      attempt.score !== null &&
      attempt.maxScore !== null
      ? { score: attempt.score.toNumber(), max: attempt.maxScore.toNumber() }
      : null;
  };
  const classScores = studentIds.flatMap((id) => {
    const score = scoreFor(id);
    return score && score.max > 0 ? [(100 * score.score) / score.max] : [];
  });
  const classAverage =
    classScores.length >= 5
      ? oneDecimal(
          classScores.reduce((sum, score) => sum + score, 0) /
            classScores.length,
        )
      : null;
  return { latest, ledgerByStudent, scoreFor, classScores, classAverage };
}

export async function getStudentExamClassAverage(
  studentId: string,
  assignmentId: string,
  classroomId: string,
  now: Date,
) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: assignmentId,
      classroomId,
      deletedAt: null,
      status: { in: ["PUBLISHED", "CLOSED", "ARCHIVED"] },
      examSession: { endsAt: { lte: now }, cancelledAt: null },
      classroom: { memberships: { some: { studentId, status: "ACTIVE" } } },
    },
    select: {
      classroom: {
        select: {
          memberships: {
            where: { status: "ACTIVE" },
            select: { studentId: true },
          },
        },
      },
    },
  });
  if (!assignment) return null;
  const scores = await loadExamScoreContext(
    assignmentId,
    classroomId,
    assignment.classroom.memberships.map((member) => member.studentId),
    now,
  );
  return scores.scoreFor(studentId) ? scores.classAverage : null;
}
