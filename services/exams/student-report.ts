import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { loadExamScoreContext } from "./student-score-context";
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
  const { latest, ledgerByStudent, scoreFor, classScores, classAverage } =
    await loadExamScoreContext(assignment.id, assignment.classroomId, [
      ...new Set([
        studentId,
        ...assignment.classroom.memberships.map((member) => member.studentId),
      ]),
    ]);
  const own = latest.get(studentId);
  const ownScore = scoreFor(studentId);
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
    publishedSubmissionId: own?.status === "PUBLISHED" ? own.id : null,
    examId,
    title: exam.title,
    courseId: exam.courseId,
    classroomId: assignment.classroomId,
    classroomName: assignment.classroom.name,
    score: ownScore.score,
    maxScore: ownScore.max,
    percentage: ownPercent,
    classAverage,
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
