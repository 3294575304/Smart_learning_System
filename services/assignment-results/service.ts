import {
  AssignmentStatus,
  GradingStatus,
  MembershipStatus,
  Prisma,
  QuestionType,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { assertTeacherOwnsAssignment } from "@/services/assignment-results/policy";
import type {
  AssignmentResultsQuery,
  TeacherResultsOverviewQuery,
} from "@/services/assignment-results/schemas";
import {
  calculateAccuracy,
  selectFrequentWrongQuestions,
} from "@/services/assignment-results/statistics";
import type {
  AssignmentResultsView,
  DistributionBucket,
  KnowledgePointAccuracy,
  QuestionAccuracy,
  SelectedStudentDetail,
  StudentAnswerDetail,
  StudentAttemptSummary,
  StudentScoreRow,
  TeacherResultsOverview,
} from "@/services/assignment-results/types";

const EFFECTIVE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];

function roundedAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 100,
    ) / 100
  );
}

export async function listTeacherResultsOverview(
  teacherId: string,
  query: TeacherResultsOverviewQuery,
): Promise<TeacherResultsOverview> {
  const where: Prisma.AssignmentWhereInput = {
    teacherId,
    status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
  };
  const [total, assignments] = await prisma.$transaction([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        title: true,
        status: true,
        dueAt: true,
        classroom: {
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                memberships: { where: { status: MembershipStatus.ACTIVE } },
              },
            },
          },
        },
        submissions: {
          where: { status: { in: EFFECTIVE_SUBMISSION_STATUSES } },
          orderBy: [{ attemptNumber: "desc" }, { id: "desc" }],
          select: {
            studentId: true,
            status: true,
            score: true,
            percentage: true,
          },
        },
      },
    }),
  ]);

  return {
    items: assignments.map((assignment) => {
      const latestByStudent = new Map<
        string,
        (typeof assignment.submissions)[number]
      >();
      for (const submission of assignment.submissions) {
        if (!latestByStudent.has(submission.studentId)) {
          latestByStudent.set(submission.studentId, submission);
        }
      }
      const latest = [...latestByStudent.values()];
      const finalized = latest.filter(
        (submission) =>
          submission.status === SubmissionStatus.GRADED ||
          submission.status === SubmissionStatus.PUBLISHED,
      );
      const scores = finalized.flatMap((submission) =>
        submission.score === null ? [] : [submission.score.toNumber()],
      );
      const percentages = finalized.flatMap((submission) =>
        submission.percentage === null
          ? []
          : [submission.percentage.toNumber()],
      );
      return {
        id: assignment.id,
        title: assignment.title,
        status: assignment.status,
        classroom: {
          id: assignment.classroom.id,
          name: assignment.classroom.name,
        },
        dueAt: assignment.dueAt,
        studentCount: assignment.classroom._count.memberships,
        submittedCount: latest.length,
        pendingReviewCount: latest.filter(
          (submission) => submission.status === SubmissionStatus.PENDING_REVIEW,
        ).length,
        averageScore: roundedAverage(scores),
        averagePercentage: roundedAverage(percentages),
        highestScore: scores.length === 0 ? null : Math.max(...scores),
        lowestScore: scores.length === 0 ? null : Math.min(...scores),
      };
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

interface SummaryDatabaseRow {
  studentCount: bigint;
  submittedCount: bigint;
  finalizedCount: bigint;
  averageScore: Prisma.Decimal | null;
  highestScore: Prisma.Decimal | null;
  lowestScore: Prisma.Decimal | null;
  below60: bigint;
  from60To69: bigint;
  from70To79: bigint;
  from80To89: bigint;
  from90To100: bigint;
}

interface QuestionAccuracyDatabaseRow {
  assignmentQuestionId: string;
  sortOrder: number;
  title: string;
  points: Prisma.Decimal;
  judgedCount: bigint;
  correctCount: bigint;
  wrongCount: bigint;
}

interface KnowledgeAccuracyDatabaseRow {
  knowledgePointId: string;
  code: string;
  name: string;
  judgedWeight: Prisma.Decimal | null;
  correctWeight: Prisma.Decimal | null;
}

interface StudentScoreDatabaseRow {
  studentId: string;
  displayName: string;
  email: string;
  studentNo: string | null;
  submissionId: string | null;
  attemptNumber: number | null;
  status: SubmissionStatus | null;
  submittedAt: Date | null;
  score: Prisma.Decimal | null;
  maxScore: Prisma.Decimal | null;
  percentage: Prisma.Decimal | null;
}

function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function latestSubmissionCte(assignmentId: string): Prisma.Sql {
  return Prisma.sql`
    WITH latest_submissions AS (
      SELECT DISTINCT ON (submission."studentId") submission.*
      FROM "Submission" AS submission
      INNER JOIN "ClassMembership" AS membership
        ON membership."studentId" = submission."studentId"
       AND membership."classroomId" = (
         SELECT assignment."classroomId"
         FROM "Assignment" AS assignment
         WHERE assignment.id = ${assignmentId}
       )
       AND membership.status = 'ACTIVE'
      WHERE submission."assignmentId" = ${assignmentId}
        AND submission.status IN (
          'SUBMITTED',
          'PENDING_REVIEW',
          'GRADED',
          'PUBLISHED'
        )
      ORDER BY
        submission."studentId",
        submission."attemptNumber" DESC,
        submission."submittedAt" DESC NULLS LAST,
        submission.id DESC
    )
  `;
}

function mapQuestionAccuracy(
  row: QuestionAccuracyDatabaseRow,
): QuestionAccuracy {
  const judgedCount = Number(row.judgedCount);
  const correctCount = Number(row.correctCount);
  return {
    assignmentQuestionId: row.assignmentQuestionId,
    sortOrder: row.sortOrder,
    title: row.title,
    points: row.points.toNumber(),
    judgedCount,
    correctCount,
    wrongCount: Number(row.wrongCount),
    accuracy: calculateAccuracy(correctCount, judgedCount),
  };
}

function mapStudentScore(row: StudentScoreDatabaseRow): StudentScoreRow {
  return {
    ...row,
    score: decimalNumber(row.score),
    maxScore: decimalNumber(row.maxScore),
    percentage: decimalNumber(row.percentage),
  };
}

function formatChoice(
  options: Array<{ labelSnapshot: string; contentSnapshot: string }>,
): string {
  if (options.length === 0) return "未作答";
  return options
    .map((option) => `${option.labelSnapshot}. ${option.contentSnapshot}`)
    .join("；");
}

function formatStudentAnswer(answer: {
  textAnswer: string | null;
  booleanAnswer: boolean | null;
  assignmentQuestion: { typeSnapshot: QuestionType };
  selectedOptions: Array<{
    assignmentQuestionOption: {
      labelSnapshot: string;
      contentSnapshot: string;
    };
  }>;
}): string {
  if (
    answer.assignmentQuestion.typeSnapshot === QuestionType.SINGLE_CHOICE ||
    answer.assignmentQuestion.typeSnapshot === QuestionType.MULTIPLE_CHOICE
  ) {
    return formatChoice(
      answer.selectedOptions.map((item) => item.assignmentQuestionOption),
    );
  }
  if (answer.assignmentQuestion.typeSnapshot === QuestionType.TRUE_FALSE) {
    if (answer.booleanAnswer === null) return "未作答";
    return answer.booleanAnswer ? "正确" : "错误";
  }
  return answer.textAnswer?.trim() || "未作答";
}

function formatCorrectAnswer(question: {
  typeSnapshot: QuestionType;
  correctBooleanSnapshot: boolean | null;
  referenceAnswerSnapshot: string | null;
  acceptableAnswersSnapshot: string[];
  optionSnapshots: Array<{
    labelSnapshot: string;
    contentSnapshot: string;
    isCorrectSnapshot: boolean;
  }>;
}): string {
  if (
    question.typeSnapshot === QuestionType.SINGLE_CHOICE ||
    question.typeSnapshot === QuestionType.MULTIPLE_CHOICE
  ) {
    return formatChoice(
      question.optionSnapshots.filter((option) => option.isCorrectSnapshot),
    );
  }
  if (question.typeSnapshot === QuestionType.TRUE_FALSE) {
    if (question.correctBooleanSnapshot === null) return "未设置";
    return question.correctBooleanSnapshot ? "正确" : "错误";
  }
  if (question.typeSnapshot === QuestionType.FILL_BLANK) {
    return question.acceptableAnswersSnapshot.length > 0
      ? question.acceptableAnswersSnapshot.join("；")
      : "未设置";
  }
  return question.referenceAnswerSnapshot?.trim() || "未设置参考答案";
}

async function loadSelectedStudent(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
  classroomId: string,
  query: AssignmentResultsQuery,
): Promise<SelectedStudentDetail | null> {
  if (!query.studentId) return null;

  const membership = await transaction.classMembership.findFirst({
    where: {
      classroomId,
      studentId: query.studentId,
      status: "ACTIVE",
    },
    select: {
      student: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true, studentNo: true } },
        },
      },
    },
  });
  if (!membership) throw new ResourceNotFoundError("学生不存在");

  const attempts = await transaction.submission.findMany({
    where: {
      assignmentId,
      studentId: query.studentId,
      status: { in: EFFECTIVE_SUBMISSION_STATUSES },
    },
    orderBy: [{ attemptNumber: "desc" }, { submittedAt: "desc" }],
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      submittedAt: true,
      score: true,
      maxScore: true,
      percentage: true,
    },
  });
  const attemptViews: StudentAttemptSummary[] = attempts.map((attempt) => ({
    ...attempt,
    score: decimalNumber(attempt.score),
    maxScore: decimalNumber(attempt.maxScore),
    percentage: decimalNumber(attempt.percentage),
  }));
  const selectedAttempt = query.submissionId
    ? attempts.find((attempt) => attempt.id === query.submissionId)
    : attempts[0];
  if (query.submissionId && !selectedAttempt) {
    throw new ResourceNotFoundError("作答记录不存在");
  }

  let answers: StudentAnswerDetail[] = [];
  if (selectedAttempt) {
    const storedAnswers = await transaction.studentAnswer.findMany({
      where: { submissionId: selectedAttempt.id },
      orderBy: { assignmentQuestion: { sortOrder: "asc" } },
      include: {
        selectedOptions: {
          orderBy: { assignmentQuestionOption: { sortOrder: "asc" } },
          select: {
            assignmentQuestionOption: {
              select: { labelSnapshot: true, contentSnapshot: true },
            },
          },
        },
        assignmentQuestion: {
          include: {
            optionSnapshots: { orderBy: { sortOrder: "asc" } },
            knowledgePointSnapshots: { orderBy: { nameSnapshot: "asc" } },
          },
        },
      },
    });
    answers = storedAnswers.map((answer) => ({
      id: answer.id,
      assignmentQuestionId: answer.assignmentQuestionId,
      sortOrder: answer.assignmentQuestion.sortOrder,
      title: answer.assignmentQuestion.titleSnapshot,
      content: answer.assignmentQuestion.contentSnapshot,
      type: answer.assignmentQuestion.typeSnapshot,
      points: answer.assignmentQuestion.points.toNumber(),
      studentAnswer: formatStudentAnswer(answer),
      correctAnswer: formatCorrectAnswer(answer.assignmentQuestion),
      score: decimalNumber(answer.score),
      maxScore: answer.maxScore.toNumber(),
      isCorrect: answer.isCorrect,
      gradingStatus: answer.gradingStatus,
      teacherFeedback: answer.teacherFeedback,
      knowledgePoints: answer.assignmentQuestion.knowledgePointSnapshots.map(
        (item) => item.nameSnapshot,
      ),
    }));
  }

  const selectedSubmission = selectedAttempt
    ? (attemptViews.find((attempt) => attempt.id === selectedAttempt.id) ??
      null)
    : null;
  return {
    student: {
      id: membership.student.id,
      displayName:
        membership.student.profile?.displayName ?? membership.student.email,
      email: membership.student.email,
      studentNo: membership.student.profile?.studentNo ?? null,
    },
    attempts: attemptViews,
    selectedSubmission,
    answers,
  };
}

export async function getTeacherAssignmentResults(
  teacherId: string,
  assignmentId: string,
  query: AssignmentResultsQuery,
): Promise<AssignmentResultsView> {
  return prisma.$transaction(
    async (transaction) => {
      const assignment = await transaction.assignment.findFirst({
        where: { id: assignmentId, teacherId },
        select: {
          id: true,
          teacherId: true,
          title: true,
          status: true,
          totalPoints: true,
          classroom: { select: { id: true, name: true } },
        },
      });
      assertTeacherOwnsAssignment(teacherId, assignment);

      const summaryRows = await transaction.$queryRaw<SummaryDatabaseRow[]>(
        Prisma.sql`
          ${latestSubmissionCte(assignmentId)}
          SELECT
            (
              SELECT COUNT(*)
              FROM "ClassMembership" AS membership
              WHERE membership."classroomId" = ${assignment.classroom.id}
                AND membership.status = 'ACTIVE'
            ) AS "studentCount",
            COUNT(latest.id) AS "submittedCount",
            COUNT(latest.id) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.score IS NOT NULL
            ) AS "finalizedCount",
            AVG(latest.score) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.score IS NOT NULL
            ) AS "averageScore",
            MAX(latest.score) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.score IS NOT NULL
            ) AS "highestScore",
            MIN(latest.score) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.score IS NOT NULL
            ) AS "lowestScore",
            COUNT(latest.id) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.percentage >= 0 AND latest.percentage < 60
            ) AS "below60",
            COUNT(latest.id) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.percentage >= 60 AND latest.percentage < 70
            ) AS "from60To69",
            COUNT(latest.id) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.percentage >= 70 AND latest.percentage < 80
            ) AS "from70To79",
            COUNT(latest.id) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.percentage >= 80 AND latest.percentage < 90
            ) AS "from80To89",
            COUNT(latest.id) FILTER (
              WHERE latest.status IN ('GRADED', 'PUBLISHED')
                AND latest.percentage >= 90 AND latest.percentage <= 100
            ) AS "from90To100"
          FROM latest_submissions AS latest
        `,
      );
      const summaryRow = summaryRows[0];
      if (!summaryRow) throw new Error("成绩统计查询未返回汇总结果");

      const questionRows = await transaction.$queryRaw<
        QuestionAccuracyDatabaseRow[]
      >(Prisma.sql`
        ${latestSubmissionCte(assignmentId)}
        SELECT
          question.id AS "assignmentQuestionId",
          question."sortOrder" AS "sortOrder",
          question."titleSnapshot" AS title,
          question.points AS points,
          COUNT(answer.id) FILTER (WHERE answer."isCorrect" IS NOT NULL) AS "judgedCount",
          COUNT(answer.id) FILTER (WHERE answer."isCorrect" = TRUE) AS "correctCount",
          COUNT(answer.id) FILTER (WHERE answer."isCorrect" = FALSE) AS "wrongCount"
        FROM "AssignmentQuestion" AS question
        LEFT JOIN latest_submissions AS latest ON TRUE
        LEFT JOIN "StudentAnswer" AS answer
          ON answer."submissionId" = latest.id
         AND answer."assignmentQuestionId" = question.id
        WHERE question."assignmentId" = ${assignmentId}
        GROUP BY question.id, question."sortOrder", question."titleSnapshot", question.points
        ORDER BY question."sortOrder" ASC
      `);

      const knowledgeRows = await transaction.$queryRaw<
        KnowledgeAccuracyDatabaseRow[]
      >(Prisma.sql`
        ${latestSubmissionCte(assignmentId)}
        SELECT
          knowledge."knowledgePointId" AS "knowledgePointId",
          knowledge."codeSnapshot" AS code,
          knowledge."nameSnapshot" AS name,
          COALESCE(
            SUM(knowledge."weightSnapshot") FILTER (
              WHERE answer."isCorrect" IS NOT NULL
            ),
            0
          ) AS "judgedWeight",
          COALESCE(
            SUM(knowledge."weightSnapshot") FILTER (
              WHERE answer."isCorrect" = TRUE
            ),
            0
          ) AS "correctWeight"
        FROM "AssignmentQuestionKnowledgePoint" AS knowledge
        INNER JOIN "AssignmentQuestion" AS question
          ON question.id = knowledge."assignmentQuestionId"
        LEFT JOIN latest_submissions AS latest ON TRUE
        LEFT JOIN "StudentAnswer" AS answer
          ON answer."submissionId" = latest.id
         AND answer."assignmentQuestionId" = question.id
        WHERE question."assignmentId" = ${assignmentId}
        GROUP BY
          knowledge."knowledgePointId",
          knowledge."codeSnapshot",
          knowledge."nameSnapshot"
        ORDER BY knowledge."nameSnapshot" ASC
      `);

      const offset = (query.page - 1) * query.pageSize;
      const studentRows = await transaction.$queryRaw<
        StudentScoreDatabaseRow[]
      >(
        Prisma.sql`
          ${latestSubmissionCte(assignmentId)}
          SELECT
            student.id AS "studentId",
            COALESCE(profile."displayName", student.email) AS "displayName",
            student.email AS email,
            profile."studentNo" AS "studentNo",
            latest.id AS "submissionId",
            latest."attemptNumber" AS "attemptNumber",
            latest.status AS status,
            latest."submittedAt" AS "submittedAt",
            latest.score AS score,
            latest."maxScore" AS "maxScore",
            latest.percentage AS percentage
          FROM "ClassMembership" AS membership
          INNER JOIN "User" AS student ON student.id = membership."studentId"
          LEFT JOIN "UserProfile" AS profile ON profile."userId" = student.id
          LEFT JOIN latest_submissions AS latest ON latest."studentId" = student.id
          WHERE membership."classroomId" = ${assignment.classroom.id}
            AND membership.status = 'ACTIVE'
          ORDER BY
            COALESCE(profile."displayName", student.email) ASC,
            student.id ASC
          LIMIT ${query.pageSize}
          OFFSET ${offset}
        `,
      );

      const studentCount = Number(summaryRow.studentCount);
      const submittedCount = Number(summaryRow.submittedCount);
      const questionAccuracy = questionRows.map(mapQuestionAccuracy);
      const knowledgePointAccuracy: KnowledgePointAccuracy[] =
        knowledgeRows.map((row) => {
          const judgedWeight = decimalNumber(row.judgedWeight) ?? 0;
          const correctWeight = decimalNumber(row.correctWeight) ?? 0;
          return {
            knowledgePointId: row.knowledgePointId,
            code: row.code,
            name: row.name,
            judgedWeight,
            correctWeight,
            accuracy: calculateAccuracy(correctWeight, judgedWeight),
          };
        });
      const distribution: DistributionBucket[] = [
        { key: "0-59", label: "0–59", count: Number(summaryRow.below60) },
        {
          key: "60-69",
          label: "60–69",
          count: Number(summaryRow.from60To69),
        },
        {
          key: "70-79",
          label: "70–79",
          count: Number(summaryRow.from70To79),
        },
        {
          key: "80-89",
          label: "80–89",
          count: Number(summaryRow.from80To89),
        },
        {
          key: "90-100",
          label: "90–100",
          count: Number(summaryRow.from90To100),
        },
      ];
      const selectedStudent = await loadSelectedStudent(
        transaction,
        assignmentId,
        assignment.classroom.id,
        query,
      );

      return {
        assignment: {
          id: assignment.id,
          title: assignment.title,
          status: assignment.status,
          totalPoints: assignment.totalPoints.toNumber(),
          classroom: assignment.classroom,
        },
        summary: {
          averageScore: decimalNumber(summaryRow.averageScore),
          highestScore: decimalNumber(summaryRow.highestScore),
          lowestScore: decimalNumber(summaryRow.lowestScore),
          finalizedCount: Number(summaryRow.finalizedCount),
          submittedCount,
          unsubmittedCount: Math.max(0, studentCount - submittedCount),
          studentCount,
        },
        distribution,
        questionAccuracy,
        knowledgePointAccuracy,
        frequentWrongQuestions: selectFrequentWrongQuestions(questionAccuracy),
        students: {
          items: studentRows.map(mapStudentScore),
          page: query.page,
          pageSize: query.pageSize,
          total: studentCount,
          totalPages: Math.ceil(studentCount / query.pageSize),
        },
        selectedStudent,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export const assignmentResultStatusLabels: Record<SubmissionStatus, string> = {
  [SubmissionStatus.IN_PROGRESS]: "作答中",
  [SubmissionStatus.SUBMITTED]: "已提交",
  [SubmissionStatus.PENDING_REVIEW]: "待人工批改",
  [SubmissionStatus.GRADED]: "已批改",
  [SubmissionStatus.PUBLISHED]: "成绩已发布",
  [SubmissionStatus.WITHDRAWN]: "已撤回",
};

export const gradingStatusLabels: Record<GradingStatus, string> = {
  [GradingStatus.UNGRADED]: "未批改",
  [GradingStatus.AUTO_GRADED]: "自动批改",
  [GradingStatus.MANUAL_REVIEW_REQUIRED]: "待人工批改",
  [GradingStatus.GRADED]: "已批改",
};
