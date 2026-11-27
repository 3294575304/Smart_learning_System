import "server-only";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { loadExamScoreContext } from "./student-score-context";
import { Prisma, type QuestionType } from "@prisma/client";
import {
  examKnowledgePoints,
  groupExamKnowledgePoints,
} from "./student-report-knowledge";
import {
  hasRecordedStudentAnswer,
  publishedReceiptOutcome,
} from "@/services/assignments/answer-presentation";
import type { ExamReviewStatus } from "./student-report-review";
import { oneDecimal, percent } from "./analysis-statistics";
import { listPublishedExamScores } from "@/services/course-analytics/exam-scores";

export async function availableStudentExamReports(
  studentId: string,
  exams: {
    id: string;
    classroomId: string;
    endsAt: Date;
    hasPublishedScore: boolean;
  }[],
  now = new Date(),
) {
  const ended = exams.filter(({ endsAt }) => endsAt <= now);
  if (!ended.length) return new Set<string>();
  const grades = await listPublishedExamScores(
    [...new Set(ended.map(({ classroomId }) => classroomId))],
    studentId,
    now,
  );
  const byAssignment = new Map(
    grades.map((grade) => [grade.assignmentId, grade]),
  );
  return new Set(
    ended
      .filter(({ id, hasPublishedScore }) => {
        const grade = byAssignment.get(id);
        return grade
          ? grade.status === "SCORED" && grade.score !== null
          : hasPublishedScore;
      })
      .map(({ id }) => id),
  );
}

const examKnowledgeNodeSelect = {
  id: true,
  nodeType: true,
  code: true,
  name: true,
  sortOrder: true,
  graphVersion: { select: { versionNumber: true } },
  incomingEdges: {
    where: { relationType: "CONTAINS", fromNode: { nodeType: "CHAPTER" } },
    orderBy: [{ fromNode: { sortOrder: "asc" } }, { fromNodeId: "asc" }],
    take: 1,
    select: {
      fromNode: {
        select: { conceptId: true, code: true, name: true, sortOrder: true },
      },
    },
  },
} satisfies Prisma.PublishedKnowledgeGraphNodeSelect;

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
          // 退课/转班后仍可查看已公布的个人报告（只读）。
          classroom: { memberships: { some: { studentId } } },
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
          classroom: { memberships: { some: { studentId } } },
          deletedAt: null,
          status: { in: ["PUBLISHED", "CLOSED"] },
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
              typeSnapshot: true,
              points: true,
              conceptSnapshots: {
                where: { resolutionStatus: "RESOLVED" },
                select: {
                  conceptId: true,
                  resolvedNode: { select: examKnowledgeNodeSelect },
                  sourceNode: { select: examKnowledgeNodeSelect },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!exam) throw new ResourceNotFoundError("考试不存在");
  const assignment = exam.assignments[0];
  if (!assignment) throw new ResourceNotFoundError("考试不存在");
  const {
    latestPublished,
    ledgerByStudent,
    scoreFor,
    classScores,
    classAverage,
  } = await loadExamScoreContext(assignment.id, assignment.classroomId, [
    ...new Set([
      studentId,
      ...assignment.classroom.memberships.map((member) => member.studentId),
    ]),
  ]);
  const own = latestPublished.get(studentId);
  const ownScore = scoreFor(studentId);
  // 成绩已公布就可以看报告，即使整场考试的窗口还没结束（提前交卷/提前出分）。
  if (!ownScore && exam.endsAt > new Date())
    throw new AssignmentOperationError("考试尚未结束", 409);
  if (!ownScore) throw new AssignmentOperationError("成绩待公布", 409);
  const published = [...latestPublished.values()].filter(
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
  const [answers, recordedAnswers] = await Promise.all([
    prisma.studentAnswer.findMany({
      where: {
        submissionId: {
          in: [
            ...new Set([
              ...published.map((item) => item.id),
              ...(own ? [own.id] : []),
            ]),
          ],
        },
      },
      select: {
        submissionId: true,
        assignmentQuestionId: true,
        score: true,
        maxScore: true,
        gradingStatus: true,
        teacherFeedback: true,
      },
    }),
    own
      ? prisma.submission.findUnique({
          where: { id: own.id },
          select: {
            answers: {
              select: {
                assignmentQuestionId: true,
                textAnswer: true,
                booleanAnswer: true,
                _count: { select: { selectedOptions: true } },
              },
            },
            attachments: {
              where: { deletedAt: null },
              select: { assignmentQuestionId: true },
            },
          },
        })
      : null,
  ]);
  const answeredIds = new Set(
    recordedAnswers?.attachments.map(
      ({ assignmentQuestionId }) => assignmentQuestionId,
    ),
  );
  for (const answer of recordedAnswers?.answers ?? []) {
    if (hasRecordedStudentAnswer(answer, answer._count.selectedOptions))
      answeredIds.add(answer.assignmentQuestionId);
  }
  const answerByPair = new Map(
    answers.map((answer) => [
      `${answer.submissionId}:${answer.assignmentQuestionId}`,
      answer,
    ]),
  );
  const concepts = new Map<
    string,
    {
      point: ReturnType<typeof examKnowledgePoints>[number];
      questionCount: number;
      ownGradedCount: number;
      ownScore: number;
      ownMax: number;
      classScore: number;
      classMax: number;
      classStudents: Set<string>;
    }
  >();
  const wrong: Array<{
    number: number;
    title: string;
    type: QuestionType;
    submissionId: string;
    score: number;
    maxScore: number;
    lostPoints: number;
    status: ExamReviewStatus;
    /** 该题是否有教师反馈，错题回顾用于标记「去看反馈」。 */
    hasFeedback: boolean;
  }> = [];
  /** 全卷索引：报告页「整卷」视图用，含未失分题；不含题目正文。 */
  const paper: Array<{
    number: number;
    title: string;
    type: QuestionType;
    score: number | null;
    maxScore: number;
    status: ExamReviewStatus | "CORRECT" | "PENDING";
    hasFeedback: boolean;
  }> = [];
  let pendingQuestions = 0;
  let unmappedQuestions = 0;
  for (const question of assignment.questions) {
    const personal = own && answerByPair.get(`${own.id}:${question.id}`);
    const score = personal?.score?.toNumber() ?? null;
    const maxScore =
      personal?.maxScore.toNumber() ?? question.points.toNumber();
    const outcome = publishedReceiptOutcome(
      personal
        ? { score, maxScore, gradingStatus: personal.gradingStatus }
        : undefined,
    );
    if (own && outcome === "PENDING") pendingQuestions += 1;
    if (own) {
      const paperStatus = !answeredIds.has(question.id)
        ? "UNANSWERED"
        : outcome === "INCORRECT" || outcome === "PARTIAL"
          ? outcome
          : outcome === "PENDING"
            ? "PENDING"
            : "CORRECT";
      paper.push({
        number: question.sortOrder,
        title: question.titleSnapshot,
        type: question.typeSnapshot,
        score,
        maxScore,
        status: paperStatus,
        hasFeedback: Boolean(personal?.teacherFeedback?.trim()),
      });
    }
    if (
      own &&
      score !== null &&
      (outcome === "INCORRECT" || outcome === "PARTIAL")
    ) {
      wrong.push({
        number: question.sortOrder,
        title: question.titleSnapshot,
        type: question.typeSnapshot,
        submissionId: own.id,
        score,
        maxScore,
        lostPoints: Number((maxScore - score).toFixed(2)),
        status: answeredIds.has(question.id) ? outcome : "UNANSWERED",
        hasFeedback: Boolean(personal?.teacherFeedback?.trim()),
      });
    }
    const points = examKnowledgePoints(question.conceptSnapshots);
    if (!points.length) unmappedQuestions += 1;
    for (const point of points) {
      const row = concepts.get(point.id) ?? {
        point,
        questionCount: 0,
        ownGradedCount: 0,
        ownScore: 0,
        ownMax: 0,
        classScore: 0,
        classMax: 0,
        classStudents: new Set<string>(),
      };
      if (point.version > row.point.version) row.point = point;
      row.questionCount += 1;
      const weight = points.length;
      if (
        personal?.score !== null &&
        personal?.score !== undefined &&
        outcome !== "PENDING"
      ) {
        row.ownGradedCount += 1;
        row.ownScore += personal.score.toNumber() / weight;
        row.ownMax += personal.maxScore.toNumber() / weight;
      }
      for (const submission of published) {
        const answer = answerByPair.get(`${submission.id}:${question.id}`);
        if (
          answer?.score != null &&
          (answer.gradingStatus === "GRADED" ||
            answer.gradingStatus === "AUTO_GRADED")
        ) {
          row.classScore += answer.score.toNumber() / weight;
          row.classMax += answer.maxScore.toNumber() / weight;
          row.classStudents.add(submission.studentId);
        }
      }
      concepts.set(point.id, row);
    }
  }
  const knowledgePoints = [...concepts.values()].map((item) => ({
    ...item.point,
    questionCount: item.questionCount,
    ownGradedCount: item.ownGradedCount,
    ownRate: percent(item.ownScore, item.ownMax),
    classRate:
      item.classStudents.size >= 5
        ? percent(item.classScore, item.classMax)
        : null,
  }));
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
    concepts: knowledgePoints,
    conceptGroups: groupExamKnowledgePoints(knowledgePoints),
    unmappedQuestions,
    pendingQuestions,
    wrong: wrong.sort((a, b) => a.number - b.number),
    paper: paper.sort((a, b) => a.number - b.number),
    feedbackCount: paper.filter((item) => item.hasFeedback).length,
  };
}
