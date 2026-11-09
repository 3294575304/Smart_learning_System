import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { latestEffectiveSubmissions } from "@/services/assignments/reporting";
import { listPublishedExamScores } from "@/services/course-analytics/exam-scores";
import {
  kr20,
  oneDecimal,
  percent,
  scoreStats,
  type ScoreStats,
} from "./analysis-statistics";

type ExamThresholds = { pass: number; excellent: number };

export interface ExamAnalysisSnapshot {
  examId: string;
  title: string;
  courseId: string;
  type: string;
  thresholds: ExamThresholds;
  overview: ScoreStats & {
    expected: number;
    participated: number;
    participationRate: number | null;
    special: number;
    unscored: number;
    publishedClassrooms: number;
    totalClassrooms: number;
    kr20: number | null;
  };
  classrooms: Array<{
    id: string;
    assignmentId: string;
    name: string;
    expected: number;
    participated: number;
    participationRate: number | null;
    special: number;
    unscored: number;
    stats: ScoreStats;
  }>;
  questions: Array<{
    questionId: string;
    number: number;
    title: string;
    content: string;
    type: string;
    points: number;
    answered: number;
    judged: number;
    averageScore: number | null;
    difficulty: number | null;
    discrimination: number | null;
    accuracy: number | null;
    averageTimeMs: number | null;
    options: Array<{
      label: string;
      correct: boolean;
      count: number;
      rate: number | null;
    }>;
    imageIds: string[];
  }>;
  concepts: Array<{
    id: string;
    name: string;
    scored: number;
    possible: number;
    questionCount: number;
    rate: number | null;
  }>;
  objectives: Array<{
    code: string;
    scored: number;
    possible: number;
    questionCount: number;
    rate: number | null;
  }>;
  unmappedQuestions: number;
}

const examSelect = Prisma.validator<Prisma.ExamSessionSelect>()({
  id: true,
  teacherId: true,
  courseId: true,
  type: true,
  title: true,
  startsAt: true,
  endsAt: true,
  allowedSwitches: true,
  cancelledAt: true,
  questionUses: {
    select: {
      questionId: true,
      objectiveCode: true,
      syllabusStructureId: true,
    },
  },
  assignments: {
    where: { deletedAt: null },
    select: {
      id: true,
      classroomId: true,
      status: true,
      classroom: {
        select: {
          id: true,
          name: true,
          memberships: {
            where: { status: "ACTIVE" },
            select: { studentId: true },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          questionId: true,
          sortOrder: true,
          titleSnapshot: true,
          contentSnapshot: true,
          typeSnapshot: true,
          points: true,
          optionSnapshots: {
            select: { id: true, labelSnapshot: true, isCorrectSnapshot: true },
          },
          conceptSnapshots: {
            select: {
              conceptId: true,
              resolutionStatus: true,
              resolvedNode: { select: { name: true } },
              sourceNode: { select: { name: true } },
            },
          },
          examImages: { select: { id: true } },
        },
      },
    },
  },
});
type ExamRecord = Prisma.ExamSessionGetPayload<{ select: typeof examSelect }>;

function ratio(score: number, max: number) {
  return max > 0 ? Math.max(0, Math.min(100, (score / max) * 100)) : null;
}

async function loadOwnedExam(teacherId: string, examId: string) {
  const exam = await prisma.examSession.findFirst({
    where: { id: examId, teacherId },
    select: examSelect,
  });
  if (!exam) throw new ResourceNotFoundError("考试不存在");
  return exam;
}

async function calculate(exam: ExamRecord, thresholds: ExamThresholds) {
  const assignmentIds = exam.assignments.map((item) => item.id);
  const classroomIds = exam.assignments.map((item) => item.classroomId);
  const [submissions, ledger] = await Promise.all([
    prisma.submission.findMany({
      where: {
        assignmentId: { in: assignmentIds },
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
        updatedAt: true,
      },
      orderBy: [
        { attemptNumber: "desc" },
        { submittedAt: "desc" },
        { id: "desc" },
      ],
    }),
    listPublishedExamScores(classroomIds),
  ]);
  const latest = latestEffectiveSubmissions(submissions);
  const eligible = new Set(
    exam.assignments.flatMap((assignment) =>
      assignment.classroom.memberships.map(
        (member) => `${assignment.id}:${member.studentId}`,
      ),
    ),
  );
  const official = new Map<
    string,
    { score: number | null; max: number; status: string; source: string }
  >();
  for (const item of ledger) {
    if (
      !item.assignmentId ||
      !eligible.has(`${item.assignmentId}:${item.studentId}`)
    )
      continue;
    official.set(`${item.assignmentId}:${item.studentId}`, {
      score: item.score,
      max: item.maxScore,
      status: item.status,
      source: `${item.gradebookId}:${item.id}:${item.publicationId}:${item.publicationVersion}`,
    });
  }
  for (const assignment of exam.assignments)
    for (const submission of latest.get(assignment.id)?.values() ?? []) {
      const key = `${assignment.id}:${submission.studentId}`;
      if (
        !eligible.has(key) ||
        official.has(key) ||
        submission.status !== "PUBLISHED"
      )
        continue;
      official.set(key, {
        score: submission.score?.toNumber() ?? null,
        max: submission.maxScore?.toNumber() ?? 0,
        status: "SCORED",
        source: submission.id,
      });
    }
  const publishedSubmissions = [...latest.values()]
    .flatMap((students) => [...students.values()])
    .filter(
      (item) =>
        item.status === "PUBLISHED" &&
        eligible.has(`${item.assignmentId}:${item.studentId}`) &&
        official.get(`${item.assignmentId}:${item.studentId}`)?.status ===
          "SCORED",
    );
  const answers = await prisma.studentAnswer.findMany({
    where: {
      submissionId: { in: publishedSubmissions.map((item) => item.id) },
    },
    select: {
      submissionId: true,
      assignmentQuestionId: true,
      score: true,
      maxScore: true,
      isCorrect: true,
      responseTimeMs: true,
      selectedOptions: { select: { assignmentQuestionOptionId: true } },
    },
  });
  const answerByPair = new Map(
    answers.map((answer) => [
      `${answer.submissionId}:${answer.assignmentQuestionId}`,
      answer,
    ]),
  );
  const objectiveByQuestion = new Map(
    exam.questionUses.map((item) => [item.questionId, item.objectiveCode]),
  );
  const classroomRows: ExamAnalysisSnapshot["classrooms"] = [];
  const allScores: number[] = [];
  let expected = 0,
    participated = 0,
    special = 0,
    unscored = 0,
    publishedClassrooms = 0;
  const ranked: Array<{ submissionId: string; percent: number }> = [];
  for (const assignment of exam.assignments) {
    const members = assignment.classroom.memberships;
    const scores: number[] = [];
    let classParticipated = 0,
      classSpecial = 0,
      classUnscored = 0,
      classPublished = false;
    for (const member of members) {
      const submission = latest.get(assignment.id)?.get(member.studentId);
      if (submission) classParticipated++;
      const grade = official.get(`${assignment.id}:${member.studentId}`);
      if (!grade) {
        if (submission) classUnscored++;
        continue;
      }
      classPublished = true;
      if (grade.status !== "SCORED") {
        if (grade.status !== "NOT_ENTERED") classSpecial++;
        else classUnscored++;
        continue;
      }
      const normalized =
        grade.score === null ? null : ratio(grade.score, grade.max);
      if (normalized === null) {
        classUnscored++;
        continue;
      }
      scores.push(normalized);
      allScores.push(normalized);
      if (submission?.status === "PUBLISHED")
        ranked.push({ submissionId: submission.id, percent: normalized });
    }
    if (classPublished) publishedClassrooms++;
    expected += members.length;
    participated += classParticipated;
    special += classSpecial;
    unscored += classUnscored;
    classroomRows.push({
      id: assignment.classroomId,
      assignmentId: assignment.id,
      name: assignment.classroom.name,
      expected: members.length,
      participated: classParticipated,
      participationRate: percent(classParticipated, members.length),
      special: classSpecial,
      unscored: classUnscored,
      stats: scoreStats(scores, thresholds),
    });
  }
  classroomRows.sort(
    (a, b) => (b.stats.average ?? -1) - (a.stats.average ?? -1),
  );
  ranked.sort(
    (a, b) =>
      b.percent - a.percent || a.submissionId.localeCompare(b.submissionId),
  );
  const rankMap = new Map(
    ranked.map((item, index) => [item.submissionId, index]),
  );
  const questionMap = new Map<
    string,
    ExamAnalysisSnapshot["questions"][number] & {
      samples: Array<{
        submissionId: string;
        percent: number;
        correct: boolean | null;
      }>;
      timeTotal: number;
      timed: number;
      optionIds: Map<string, string>;
    }
  >();
  const conceptMap = new Map<
    string,
    ExamAnalysisSnapshot["concepts"][number]
  >();
  const objectiveMap = new Map<
    string,
    ExamAnalysisSnapshot["objectives"][number]
  >();
  let unmappedQuestions = 0;
  for (const assignment of exam.assignments)
    for (const question of assignment.questions) {
      const key = `${question.sortOrder}:${question.questionId}`;
      let row = questionMap.get(key);
      if (!row) {
        row = {
          questionId: question.questionId,
          number: question.sortOrder,
          title: question.titleSnapshot,
          content: question.contentSnapshot,
          type: question.typeSnapshot,
          points: question.points.toNumber(),
          answered: 0,
          judged: 0,
          averageScore: null,
          difficulty: null,
          discrimination: null,
          accuracy: null,
          averageTimeMs: null,
          options: question.optionSnapshots.map((item) => ({
            label: item.labelSnapshot,
            correct: item.isCorrectSnapshot,
            count: 0,
            rate: null,
          })),
          imageIds: question.examImages.map((item) => item.id),
          samples: [],
          timeTotal: 0,
          timed: 0,
          optionIds: new Map(
            question.optionSnapshots.map((item) => [
              item.id,
              item.labelSnapshot,
            ]),
          ),
        };
        questionMap.set(key, row);
        if (
          !question.conceptSnapshots.some(
            (item) => item.resolutionStatus === "RESOLVED",
          )
        )
          unmappedQuestions++;
      }
      const currentSubmissions = [
        ...(latest.get(assignment.id)?.values() ?? []),
      ].filter(
        (item) =>
          item.status === "PUBLISHED" &&
          eligible.has(`${assignment.id}:${item.studentId}`) &&
          official.get(`${assignment.id}:${item.studentId}`)?.status ===
            "SCORED",
      );
      for (const submission of currentSubmissions) {
        const answer = answerByPair.get(`${submission.id}:${question.id}`);
        if (!answer) continue;
        row.answered++;
        if (answer.responseTimeMs !== null && answer.responseTimeMs > 0) {
          row.timeTotal += answer.responseTimeMs;
          row.timed++;
        }
        for (const selected of answer.selectedOptions) {
          const label =
            row.optionIds.get(selected.assignmentQuestionOptionId) ??
            question.optionSnapshots.find(
              (item) => item.id === selected.assignmentQuestionOptionId,
            )?.labelSnapshot;
          const option = row.options.find((item) => item.label === label);
          if (option) option.count++;
        }
        if (answer.score === null || answer.maxScore.toNumber() <= 0) continue;
        const score = answer.score.toNumber();
        row.judged++;
        row.samples.push({
          submissionId: submission.id,
          percent: ratio(score, answer.maxScore.toNumber()) ?? 0,
          correct: answer.isCorrect,
        });
        const resolved = question.conceptSnapshots.filter(
          (item) => item.resolutionStatus === "RESOLVED",
        );
        for (const concept of resolved) {
          const aggregate = conceptMap.get(concept.conceptId) ?? {
            id: concept.conceptId,
            name: concept.resolvedNode?.name ?? concept.sourceNode.name,
            scored: 0,
            possible: 0,
            questionCount: 0,
            rate: null,
          };
          aggregate.scored += score / resolved.length;
          aggregate.possible += answer.maxScore.toNumber() / resolved.length;
          conceptMap.set(concept.conceptId, aggregate);
        }
        const code = objectiveByQuestion.get(question.questionId);
        if (code) {
          const aggregate = objectiveMap.get(code) ?? {
            code,
            scored: 0,
            possible: 0,
            questionCount: 0,
            rate: null,
          };
          aggregate.scored += score;
          aggregate.possible += answer.maxScore.toNumber();
          objectiveMap.set(code, aggregate);
        }
      }
    }
  const questions = [...questionMap.values()]
    .sort((a, b) => a.number - b.number)
    .map((row) => {
      const values = row.samples.map((item) => item.percent);
      const groupSize = Math.floor(ranked.length * 0.27);
      const high = row.samples.filter(
        (item) => (rankMap.get(item.submissionId) ?? Infinity) < groupSize,
      );
      const low = row.samples.filter(
        (item) =>
          (rankMap.get(item.submissionId) ?? -1) >= ranked.length - groupSize,
      );
      const average = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;
      const { samples, timeTotal, timed, optionIds, ...publicRow } = row;
      void samples;
      void optionIds;
      return {
        ...publicRow,
        averageScore:
          average === null ? null : oneDecimal((average * row.points) / 100),
        difficulty:
          values.length < 5 || average === null
            ? null
            : oneDecimal(average) / 100,
        discrimination:
          groupSize >= 2 && high.length >= 2 && low.length >= 2
            ? oneDecimal(
                high.reduce((sum, item) => sum + item.percent, 0) /
                  high.length -
                  low.reduce((sum, item) => sum + item.percent, 0) / low.length,
              ) / 100
            : null,
        accuracy:
          [
            "SINGLE_CHOICE",
            "MULTIPLE_CHOICE",
            "TRUE_FALSE",
            "FILL_BLANK",
          ].includes(row.type) &&
          row.samples.filter((item) => item.correct !== null).length >= 5
            ? percent(
                row.samples.filter((item) => item.correct === true).length,
                row.samples.filter((item) => item.correct !== null).length,
              )
            : null,
        averageTimeMs: timed ? Math.round(timeTotal / timed) : null,
        options: row.options.map((option) => ({
          ...option,
          rate: percent(option.count, row.answered),
        })),
      };
    });
  const countByConcept = new Map<string, Set<string>>();
  for (const assignment of exam.assignments)
    for (const question of assignment.questions)
      for (const concept of question.conceptSnapshots.filter(
        (item) => item.resolutionStatus === "RESOLVED",
      )) {
        const set = countByConcept.get(concept.conceptId) ?? new Set<string>();
        set.add(question.questionId);
        countByConcept.set(concept.conceptId, set);
      }
  const concepts = [...conceptMap.values()].map((item) => ({
    ...item,
    scored: oneDecimal(item.scored),
    possible: oneDecimal(item.possible),
    questionCount: countByConcept.get(item.id)?.size ?? 0,
    rate: percent(item.scored, item.possible),
  }));
  const objectiveCounts = new Map<string, Set<string>>();
  for (const use of exam.questionUses)
    if (use.objectiveCode) {
      const set = objectiveCounts.get(use.objectiveCode) ?? new Set<string>();
      set.add(use.questionId);
      objectiveCounts.set(use.objectiveCode, set);
    }
  const objectives = [...objectiveMap.values()].map((item) => ({
    ...item,
    scored: oneDecimal(item.scored),
    possible: oneDecimal(item.possible),
    questionCount: objectiveCounts.get(item.code)?.size ?? 0,
    rate: percent(item.scored, item.possible),
  }));
  const objectiveQuestions = questions.filter((item) =>
    ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "FILL_BLANK"].includes(
      item.type,
    ),
  );
  const binaryRows = publishedSubmissions.map((submission) =>
    objectiveQuestions.map((question) => {
      const assignment = exam.assignments.find(
        (item) => item.id === submission.assignmentId,
      );
      const snapshot = assignment?.questions.find(
        (item) =>
          item.questionId === question.questionId &&
          item.sortOrder === question.number,
      );
      const answer =
        snapshot && answerByPair.get(`${submission.id}:${snapshot.id}`);
      if (
        !answer ||
        answer.score === null ||
        ![0, answer.maxScore.toNumber()].includes(answer.score.toNumber())
      )
        return -1;
      return answer.isCorrect === true
        ? 1
        : answer.isCorrect === false
          ? 0
          : -1;
    }),
  );
  const snapshot: ExamAnalysisSnapshot = {
    examId: exam.id,
    title: exam.title,
    courseId: exam.courseId,
    type: exam.type,
    thresholds,
    overview: {
      ...scoreStats(allScores, thresholds),
      expected,
      participated,
      participationRate: percent(participated, expected),
      special,
      unscored,
      publishedClassrooms,
      totalClassrooms: exam.assignments.length,
      kr20: kr20(binaryRows),
    },
    classrooms: classroomRows,
    questions,
    concepts,
    objectives,
    unmappedQuestions,
  };
  return snapshot;
}

export async function getTeacherExamDetails(teacherId: string, examId: string) {
  const exam = await loadOwnedExam(teacherId, examId);
  if (exam.cancelledAt || exam.endsAt > new Date())
    return { exam, analysis: null };
  const analysis = await calculate(exam, { pass: 60, excellent: 85 });
  return {
    exam,
    analysis: analysis.overview.publishedClassrooms ? analysis : null,
  };
}
