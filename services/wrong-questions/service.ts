import {
  GradingStatus,
  MembershipStatus,
  Prisma,
  QuestionType,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  formatCorrectAnswer,
  formatStudentAnswer,
} from "@/services/assignments/answer-presentation";
import { gradeAnswer } from "@/services/assignments/grading";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { WrongQuestionOperationError } from "@/services/wrong-questions/errors";
import {
  type WrongQuestionListQuery,
  type WrongQuestionMasteryInput,
  type WrongQuestionPracticeAnswer,
  type WrongQuestionPracticeInput,
  wrongQuestionIdSchema,
  wrongQuestionListQuerySchema,
  wrongQuestionMasterySchema,
  wrongQuestionPracticeSchema,
} from "@/services/wrong-questions/schemas";
import type {
  WrongQuestionDetail,
  WrongQuestionKnowledgePoint,
  WrongQuestionListItem,
  WrongQuestionListResult,
  WrongQuestionMasteryResult,
  WrongQuestionPracticeResult,
} from "@/services/wrong-questions/types";

const wrongQuestionInclude = Prisma.validator<Prisma.WrongQuestionInclude>()({
  studentAnswer: {
    include: {
      submission: {
        select: {
          id: true,
          studentId: true,
          status: true,
        },
      },
      selectedOptions: {
        include: {
          assignmentQuestionOption: true,
        },
      },
    },
  },
  assignmentQuestion: {
    include: {
      assignment: {
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      knowledgePointSnapshots: {
        orderBy: [{ nameSnapshot: "asc" }, { knowledgePointId: "asc" }],
      },
      optionSnapshots: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  },
  recommendationAnswer: {
    include: {
      recommendation: {
        select: {
          id: true,
          studentId: true,
        },
      },
    },
  },
  sourceQuestion: {
    include: {
      knowledgePointLinks: {
        include: {
          knowledgePoint: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: [{ knowledgePointId: "asc" }],
      },
      options: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  },
});

type WrongQuestionRecord = Prisma.WrongQuestionGetPayload<{
  include: typeof wrongQuestionInclude;
}>;

function accessibleSourceWhere(
  studentId: string,
): Prisma.WrongQuestionWhereInput {
  return {
    OR: [
      {
        studentAnswer: {
          is: {
            submission: {
              studentId,
              status: SubmissionStatus.PUBLISHED,
              assignment: {
                classroom: {
                  memberships: {
                    some: {
                      studentId,
                      status: MembershipStatus.ACTIVE,
                    },
                  },
                },
              },
            },
          },
        },
        assignmentQuestion: { isNot: null },
      },
      {
        recommendationAnswer: {
          is: {
            recommendation: {
              studentId,
            },
          },
        },
        sourceQuestion: { isNot: null },
      },
    ],
  };
}

function baseVisibleWhere(studentId: string): Prisma.WrongQuestionWhereInput {
  return {
    studentId,
    AND: [accessibleSourceWhere(studentId)],
  };
}

function filteredWhere(
  studentId: string,
  query: WrongQuestionListQuery,
  now: Date,
): Prisma.WrongQuestionWhereInput {
  const filters: Prisma.WrongQuestionWhereInput[] = [
    accessibleSourceWhere(studentId),
  ];

  if (query.keyword) {
    filters.push({
      OR: [
        {
          assignmentQuestion: {
            is: {
              OR: [
                {
                  titleSnapshot: {
                    contains: query.keyword,
                    mode: "insensitive",
                  },
                },
                {
                  contentSnapshot: {
                    contains: query.keyword,
                    mode: "insensitive",
                  },
                },
              ],
            },
          },
        },
        {
          sourceQuestion: {
            is: {
              OR: [
                {
                  title: { contains: query.keyword, mode: "insensitive" },
                },
                {
                  content: { contains: query.keyword, mode: "insensitive" },
                },
              ],
            },
          },
        },
      ],
    });
  }

  if (query.classroomId) {
    filters.push({
      assignmentQuestion: {
        is: {
          assignment: {
            classroomId: query.classroomId,
          },
        },
      },
    });
  }

  if (query.knowledgePointId) {
    filters.push({
      OR: [
        {
          assignmentQuestion: {
            is: {
              knowledgePointSnapshots: {
                some: { knowledgePointId: query.knowledgePointId },
              },
            },
          },
        },
        {
          sourceQuestion: {
            is: {
              knowledgePointLinks: {
                some: { knowledgePointId: query.knowledgePointId },
              },
            },
          },
        },
      ],
    });
  }

  if (query.type) {
    filters.push({
      OR: [
        {
          assignmentQuestion: {
            is: { typeSnapshot: query.type },
          },
        },
        {
          sourceQuestion: {
            is: { type: query.type },
          },
        },
      ],
    });
  }

  if (query.isMastered !== undefined) {
    filters.push({ isResolved: query.isMastered });
  }

  if (query.recentDays) {
    filters.push({
      lastWrongAt: {
        gte: new Date(now.getTime() - query.recentDays * 86_400_000),
      },
    });
  }

  return {
    studentId,
    AND: filters,
  };
}

function summaryText(content: string): string {
  const normalized = content.replace(/\s+/gu, " ").trim();
  return normalized.length > 160
    ? `${normalized.slice(0, 157)}...`
    : normalized;
}

function formatLiveOptions(
  options: Array<{ label: string; content: string }>,
): string {
  if (options.length === 0) return "未作答";
  return options
    .map((option) => `${option.label}. ${option.content}`)
    .join("；");
}

function formatRecommendationStudentAnswer(
  record: WrongQuestionRecord,
): string {
  const answer = record.recommendationAnswer;
  const question = record.sourceQuestion;
  if (!answer || !question) return "未作答";

  if (
    question.type === QuestionType.SINGLE_CHOICE ||
    question.type === QuestionType.MULTIPLE_CHOICE
  ) {
    const selectedIds = new Set(answer.selectedOptionIds);
    return formatLiveOptions(
      question.options.filter((option) => selectedIds.has(option.id)),
    );
  }
  if (question.type === QuestionType.TRUE_FALSE) {
    if (answer.booleanAnswer === null) return "未作答";
    return answer.booleanAnswer ? "正确" : "错误";
  }
  return answer.textAnswer?.trim() || "未作答";
}

function formatRecommendationCorrectAnswer(
  record: WrongQuestionRecord,
): string {
  const question = record.sourceQuestion;
  if (!question) return "未设置";

  if (
    question.type === QuestionType.SINGLE_CHOICE ||
    question.type === QuestionType.MULTIPLE_CHOICE
  ) {
    return formatLiveOptions(
      question.options.filter((option) => option.isCorrect),
    );
  }
  if (question.type === QuestionType.TRUE_FALSE) {
    if (question.correctBoolean === null) return "未设置";
    return question.correctBoolean ? "正确" : "错误";
  }
  if (question.type === QuestionType.FILL_BLANK) {
    return question.acceptableAnswers.length > 0
      ? question.acceptableAnswers.join("；")
      : "未设置";
  }
  return question.referenceAnswer?.trim() || "未设置参考答案";
}

function assignmentKnowledgePoints(
  record: WrongQuestionRecord,
): WrongQuestionKnowledgePoint[] {
  return (
    record.assignmentQuestion?.knowledgePointSnapshots.map((item) => ({
      id: item.knowledgePointId,
      name: item.nameSnapshot,
    })) ?? []
  );
}

function recommendationKnowledgePoints(
  record: WrongQuestionRecord,
): WrongQuestionKnowledgePoint[] {
  return (
    record.sourceQuestion?.knowledgePointLinks.map((item) => ({
      id: item.knowledgePoint.id,
      name: item.knowledgePoint.name,
    })) ?? []
  );
}

function listItemFromRecord(
  record: WrongQuestionRecord,
): WrongQuestionListItem {
  if (record.assignmentQuestion && record.studentAnswer) {
    const question = record.assignmentQuestion;
    return {
      id: record.id,
      questionId: question.questionId,
      title: question.titleSnapshot,
      summary: summaryText(question.contentSnapshot),
      type: question.typeSnapshot,
      knowledgePoints: assignmentKnowledgePoints(record),
      wrongCount: record.wrongCount,
      lastWrongAt: record.lastWrongAt,
      recentWrongAnswer: formatStudentAnswer(
        record.studentAnswer,
        question.typeSnapshot,
      ),
      isMastered: record.isResolved,
      masteredAt: record.resolvedAt,
      sourceType: "ASSIGNMENT",
      sourceLabel: question.assignment.title,
      sourceRecordId: record.studentAnswer.submission.id,
      classroom: question.assignment.classroom,
    };
  }

  if (
    record.sourceQuestion &&
    record.recommendationAnswer &&
    record.recommendationAnswer.recommendation
  ) {
    const question = record.sourceQuestion;
    return {
      id: record.id,
      questionId: question.id,
      title: question.title,
      summary: summaryText(question.content),
      type: question.type,
      knowledgePoints: recommendationKnowledgePoints(record),
      wrongCount: record.wrongCount,
      lastWrongAt: record.lastWrongAt,
      recentWrongAnswer: formatRecommendationStudentAnswer(record),
      isMastered: record.isResolved,
      masteredAt: record.resolvedAt,
      sourceType: "RECOMMENDATION",
      sourceLabel: "推荐练习",
      sourceRecordId: record.recommendationAnswer.recommendation.id,
      classroom: null,
    };
  }

  throw new ResourceNotFoundError("错题记录来源不完整");
}

function detailFromRecord(record: WrongQuestionRecord): WrongQuestionDetail {
  const item = listItemFromRecord(record);
  if (record.assignmentQuestion) {
    const question = record.assignmentQuestion;
    return {
      ...item,
      content: question.contentSnapshot,
      correctAnswer: formatCorrectAnswer(question),
      explanation: question.explanationSnapshot,
      options: question.optionSnapshots.map((option) => ({
        id: option.id,
        label: option.labelSnapshot,
        content: option.contentSnapshot,
        sortOrder: option.sortOrder,
      })),
    };
  }

  const question = record.sourceQuestion;
  if (!question) throw new ResourceNotFoundError("错题记录来源不完整");
  return {
    ...item,
    content: question.content,
    correctAnswer: formatRecommendationCorrectAnswer(record),
    explanation: question.explanation,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      content: option.content,
      sortOrder: option.sortOrder,
    })),
  };
}

async function loadOwnedVisibleWrongQuestion(
  studentId: string,
  wrongQuestionId: string,
): Promise<WrongQuestionRecord> {
  const record = await prisma.wrongQuestion.findFirst({
    where: {
      id: wrongQuestionId,
      ...baseVisibleWhere(studentId),
    },
    include: wrongQuestionInclude,
  });
  if (!record) throw new ResourceNotFoundError("错题记录不存在");
  return record;
}

function filterOptionsFromRecords(records: WrongQuestionRecord[]) {
  const classroomMap = new Map<string, string>();
  const knowledgePointMap = new Map<string, string>();

  for (const record of records) {
    if (record.assignmentQuestion) {
      const classroom = record.assignmentQuestion.assignment.classroom;
      classroomMap.set(classroom.id, classroom.name);
      for (const item of assignmentKnowledgePoints(record)) {
        knowledgePointMap.set(item.id, item.name);
      }
    }
    for (const item of recommendationKnowledgePoints(record)) {
      knowledgePointMap.set(item.id, item.name);
    }
  }

  return {
    classrooms: [...classroomMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN")),
    knowledgePoints: [...knowledgePointMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN")),
  };
}

export async function listWrongQuestions(
  studentId: string,
  rawQuery: unknown,
  now = new Date(),
): Promise<WrongQuestionListResult> {
  const query = wrongQuestionListQuerySchema.parse(rawQuery);
  const visibleWhere = baseVisibleWhere(studentId);
  const where = filteredWhere(studentId, query, now);

  const [records, total, stateCounts, optionRecords] = await Promise.all([
    prisma.wrongQuestion.findMany({
      where,
      include: wrongQuestionInclude,
      orderBy: [{ lastWrongAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.wrongQuestion.count({ where }),
    prisma.wrongQuestion.groupBy({
      by: ["isResolved"],
      where: visibleWhere,
      _count: { _all: true },
    }),
    prisma.wrongQuestion.findMany({
      where: visibleWhere,
      include: wrongQuestionInclude,
      orderBy: [{ id: "asc" }],
    }),
  ]);

  const mastered =
    stateCounts.find((item) => item.isResolved)?._count._all ?? 0;
  const unmastered =
    stateCounts.find((item) => !item.isResolved)?._count._all ?? 0;

  return {
    summary: {
      total: mastered + unmastered,
      mastered,
      unmastered,
    },
    filterOptions: filterOptionsFromRecords(optionRecords),
    items: records.map(listItemFromRecord),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getWrongQuestionDetail(
  studentId: string,
  rawWrongQuestionId: unknown,
): Promise<WrongQuestionDetail> {
  const wrongQuestionId = wrongQuestionIdSchema.parse(rawWrongQuestionId);
  return detailFromRecord(
    await loadOwnedVisibleWrongQuestion(studentId, wrongQuestionId),
  );
}

export async function setWrongQuestionMastery(
  studentId: string,
  rawWrongQuestionId: unknown,
  rawInput: unknown,
  now = new Date(),
): Promise<WrongQuestionMasteryResult> {
  const wrongQuestionId = wrongQuestionIdSchema.parse(rawWrongQuestionId);
  const input: WrongQuestionMasteryInput =
    wrongQuestionMasterySchema.parse(rawInput);
  const current = await loadOwnedVisibleWrongQuestion(
    studentId,
    wrongQuestionId,
  );

  if (current.isResolved === input.isMastered) {
    return {
      id: current.id,
      isMastered: current.isResolved,
      masteredAt: current.resolvedAt,
    };
  }

  await prisma.wrongQuestion.updateMany({
    where: {
      id: wrongQuestionId,
      studentId,
      isResolved: !input.isMastered,
    },
    data: input.isMastered
      ? {
          isResolved: true,
          resolvedAt: now,
          lastReviewedAt: now,
        }
      : {
          isResolved: false,
          resolvedAt: null,
        },
  });

  const updated = await prisma.wrongQuestion.findFirst({
    where: { id: wrongQuestionId, studentId },
    select: { id: true, isResolved: true, resolvedAt: true },
  });
  if (!updated) throw new ResourceNotFoundError("错题记录不存在");
  return {
    id: updated.id,
    isMastered: updated.isResolved,
    masteredAt: updated.resolvedAt,
  };
}

function validatePracticeAnswer(
  detail: WrongQuestionDetail,
  answer: WrongQuestionPracticeAnswer,
): void {
  if (
    (detail.type === QuestionType.SINGLE_CHOICE ||
      detail.type === QuestionType.MULTIPLE_CHOICE) &&
    answer.kind === "CHOICE"
  ) {
    const optionIds = new Set(detail.options.map((option) => option.id));
    if (answer.optionIds.some((optionId) => !optionIds.has(optionId))) {
      throw new WrongQuestionOperationError("答案包含不属于当前题目的选项");
    }
    if (
      detail.type === QuestionType.SINGLE_CHOICE &&
      answer.optionIds.length !== 1
    ) {
      throw new WrongQuestionOperationError("单选题只能选择一个选项");
    }
    return;
  }
  if (detail.type === QuestionType.TRUE_FALSE && answer.kind === "BOOLEAN") {
    return;
  }
  if (
    (detail.type === QuestionType.FILL_BLANK ||
      detail.type === QuestionType.SHORT_ANSWER) &&
    answer.kind === "TEXT"
  ) {
    return;
  }
  throw new WrongQuestionOperationError("题型与提交答案不匹配");
}

function formatSubmittedPracticeAnswer(
  detail: WrongQuestionDetail,
  answer: WrongQuestionPracticeAnswer,
): string {
  if (answer.kind === "CHOICE") {
    const selected = new Set(answer.optionIds);
    return formatLiveOptions(
      detail.options.filter((option) => selected.has(option.id)),
    );
  }
  if (answer.kind === "BOOLEAN") return answer.value ? "正确" : "错误";
  return answer.value.trim();
}

export async function practiceWrongQuestion(
  studentId: string,
  rawWrongQuestionId: unknown,
  rawInput: unknown,
): Promise<WrongQuestionPracticeResult> {
  const wrongQuestionId = wrongQuestionIdSchema.parse(rawWrongQuestionId);
  const input: WrongQuestionPracticeInput =
    wrongQuestionPracticeSchema.parse(rawInput);
  const record = await loadOwnedVisibleWrongQuestion(
    studentId,
    wrongQuestionId,
  );
  const detail = detailFromRecord(record);
  validatePracticeAnswer(detail, input.answer);

  const result = gradeAnswer(
    record.assignmentQuestion
      ? {
          type: record.assignmentQuestion.typeSnapshot,
          points: 1,
          correctBoolean: record.assignmentQuestion.correctBooleanSnapshot,
          acceptableAnswers:
            record.assignmentQuestion.acceptableAnswersSnapshot,
          isCaseSensitive: record.assignmentQuestion.isCaseSensitiveSnapshot,
          options: record.assignmentQuestion.optionSnapshots.map((option) => ({
            id: option.id,
            isCorrect: option.isCorrectSnapshot,
          })),
        }
      : {
          type: record.sourceQuestion?.type ?? detail.type,
          points: 1,
          correctBoolean: record.sourceQuestion?.correctBoolean ?? null,
          acceptableAnswers: record.sourceQuestion?.acceptableAnswers ?? [],
          isCaseSensitive: record.sourceQuestion?.isCaseSensitive ?? false,
          options:
            record.sourceQuestion?.options.map((option) => ({
              id: option.id,
              isCorrect: option.isCorrect,
            })) ?? [],
        },
    {
      assignmentQuestionId: detail.questionId,
      ...input.answer,
    },
  );

  return {
    gradingStatus: result.gradingStatus,
    isCorrect: result.isCorrect,
    studentAnswer: formatSubmittedPracticeAnswer(detail, input.answer),
    correctAnswer: detail.correctAnswer,
    explanation: detail.explanation,
    canMarkMastered:
      result.gradingStatus === GradingStatus.AUTO_GRADED &&
      result.isCorrect === true,
  };
}
