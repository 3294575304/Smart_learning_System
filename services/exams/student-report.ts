import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { latestEffectiveSubmissions } from "@/services/assignments/reporting";
import { listPublishedExamScores } from "@/services/course-analytics/exam-scores";
import { oneDecimal, percent } from "./analysis-statistics";

export async function getStudentExamReport(
  studentId: string,
  examId: string,
  classroomId?: string,
) {
  const exam = await prisma.examSession.findFirst({
    where: {
      id: examId,
      cancelledAt: null,
      assignments: {
        some: {
          classroom: { memberships: { some: { studentId, status: "ACTIVE" } } },
        },
      },
    },
    select: {
      id: true,
      title: true,
      courseId: true,
      endsAt: true,
      assignments: {
        where: {
          classroom: { memberships: { some: { studentId, status: "ACTIVE" } } },
          deletedAt: null,
          ...(classroomId ? { classroomId } : {}),
        },
        select: {
          id: true,
          classroomId: true,
          classroom: {
            select: {
              name: true,
              memberships: {
                where: { status: "ACTIVE" },
                select: { studentId: true },
              },
            },
          },
          questions: {
            select: {
              id: true,
              questionId: true,
              sortOrder: true,
              titleSnapshot: true,
              points: true,
              conceptSnapshots: {
                where: { resolutionStatus: "RESOLVED" },
                select: {
                  conceptId: true,
                  resolvedNode: { select: { name: true } },
                  sourceNode: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!exam) throw new ResourceNotFoundError("考试不存在");
  if (exam.endsAt > new Date())
    throw new AssignmentOperationError("考试尚未结束", 409);
  const assignment = exam.assignments[0];
  if (!assignment) throw new ResourceNotFoundError("考试不存在");
  const submissions = await prisma.submission.findMany({
    where: {
      assignmentId: assignment.id,
      status: { in: ["SUBMITTED", "PENDING_REVIEW", "GRADED", "PUBLISHED"] },
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
  });
  const latest =
    latestEffectiveSubmissions(submissions).get(assignment.id) ?? new Map();
  const own = latest.get(studentId);
  const ledger = await listPublishedExamScores([assignment.classroomId]);
  const ledgerByStudent = new Map(
    ledger
      .filter((item) => item.assignmentId === assignment.id)
      .map((item) => [item.studentId, item]),
  );
  const ownLedger = ledgerByStudent.get(studentId);
  const ownScore = ownLedger
    ? ownLedger.status === "SCORED" && ownLedger.score !== null
      ? { score: ownLedger.score, max: ownLedger.maxScore }
      : null
    : own?.status === "PUBLISHED" && own.score !== null && own.maxScore !== null
      ? { score: own.score.toNumber(), max: own.maxScore.toNumber() }
      : null;
  if (!ownScore) throw new AssignmentOperationError("成绩待公布", 409);
  const published = [...latest.values()].filter(
    (item) =>
      item.status === "PUBLISHED" &&
      assignment.classroom.memberships.some(
        (member) => member.studentId === item.studentId,
      ) &&
      (!ledgerByStudent.has(item.studentId) ||
        ledgerByStudent.get(item.studentId)?.status === "SCORED"),
  );
  const classScores = assignment.classroom.memberships.flatMap((member) => {
    const grade = ledgerByStudent.get(member.studentId);
    const submission = latest.get(member.studentId);
    if (grade)
      return grade.status === "SCORED" &&
        grade.score !== null &&
        grade.maxScore > 0
        ? [(grade.score / grade.maxScore) * 100]
        : [];
    return submission?.status === "PUBLISHED" &&
      submission.score !== null &&
      submission.maxScore !== null &&
      submission.maxScore.toNumber() > 0
      ? [(submission.score.toNumber() / submission.maxScore.toNumber()) * 100]
      : [];
  });
  const ownPercent =
    ownScore.max > 0 ? oneDecimal((ownScore.score / ownScore.max) * 100) : null;
  const rank =
    ownPercent !== null && classScores.length >= 10
      ? Math.ceil(
          ((classScores.filter((score) => score > ownPercent).length + 1) /
            classScores.length) *
            10,
        ) * 10
      : null;
  const answers = await prisma.studentAnswer.findMany({
    where: { submissionId: { in: published.map((item) => item.id) } },
    select: {
      submissionId: true,
      assignmentQuestionId: true,
      score: true,
      maxScore: true,
      isCorrect: true,
    },
  });
  const answerByPair = new Map(
    answers.map((answer) => [
      `${answer.submissionId}:${answer.assignmentQuestionId}`,
      answer,
    ]),
  );
  const concepts = new Map<
    string,
    {
      id: string;
      name: string;
      ownScore: number;
      ownMax: number;
      classScore: number;
      classMax: number;
      classStudents: Set<string>;
    }
  >();
  const wrong: Array<{ number: number; title: string; submissionId: string }> =
    [];
  for (const question of assignment.questions) {
    const personal = own && answerByPair.get(`${own.id}:${question.id}`);
    if (
      personal &&
      personal.score !== null &&
      personal.score.toNumber() < personal.maxScore.toNumber()
    )
      wrong.push({
        number: question.sortOrder,
        title: question.titleSnapshot,
        submissionId: own.id,
      });
    for (const concept of question.conceptSnapshots) {
      const row = concepts.get(concept.conceptId) ?? {
        id: concept.conceptId,
        name: concept.resolvedNode?.name ?? concept.sourceNode.name,
        ownScore: 0,
        ownMax: 0,
        classScore: 0,
        classMax: 0,
        classStudents: new Set<string>(),
      };
      const weight = question.conceptSnapshots.length;
      if (personal?.score !== null && personal?.score !== undefined) {
        row.ownScore += personal.score.toNumber() / weight;
        row.ownMax += personal.maxScore.toNumber() / weight;
      }
      for (const submission of published) {
        const answer = answerByPair.get(`${submission.id}:${question.id}`);
        if (answer?.score !== null && answer?.score !== undefined) {
          row.classScore += answer.score.toNumber() / weight;
          row.classMax += answer.maxScore.toNumber() / weight;
          row.classStudents.add(submission.studentId);
        }
      }
      concepts.set(concept.conceptId, row);
    }
  }
  return {
    examId,
    title: exam.title,
    courseId: exam.courseId,
    classroomId: assignment.classroomId,
    classroomName: assignment.classroom.name,
    score: ownScore.score,
    maxScore: ownScore.max,
    percentage: ownPercent,
    classAverage:
      classScores.length >= 5
        ? oneDecimal(
            classScores.reduce((sum, score) => sum + score, 0) /
              classScores.length,
          )
        : null,
    rankBand: rank,
    classScoredCount: classScores.length,
    concepts: [...concepts.values()].map((item) => ({
      id: item.id,
      name: item.name,
      ownRate: percent(item.ownScore, item.ownMax),
      classRate:
        item.classStudents.size >= 5
          ? percent(item.classScore, item.classMax)
          : null,
    })),
    unmappedQuestions: assignment.questions.filter(
      (item) => !item.conceptSnapshots.length,
    ).length,
    wrong,
  };
}
