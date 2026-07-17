import "server-only";

import {
  AssignmentStatus,
  GradingStatus,
  MembershipStatus,
  Prisma,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { gradeAnswer } from "@/services/assignments/grading";
import {
  assertActiveMembership,
  assertAssignmentAcceptsWork,
  assertAssignmentIsVisible,
  assertCanStartAttempt,
  assertDraftAssignment,
  assertTeacherOwnsClassroom,
  canTeacherUseQuestion,
} from "@/services/assignments/policy";
import type {
  AssignmentListQuery,
  AssignmentUpsertData,
  AutosaveAnswersData,
  SavedAnswerInput,
} from "@/services/assignments/schemas";
import type {
  StudentAssignmentListItem,
  SubmissionResultView,
  TeacherAssignmentView,
} from "@/services/assignments/types";

const teacherAssignmentInclude = {
  classroom: { select: { id: true, name: true } },
  questions: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      questionId: true,
      titleSnapshot: true,
      typeSnapshot: true,
      sortOrder: true,
      points: true,
    },
  },
} satisfies Prisma.AssignmentInclude;

const studentQuestionSelect = {
  id: true,
  titleSnapshot: true,
  contentSnapshot: true,
  typeSnapshot: true,
  sortOrder: true,
  points: true,
  optionSnapshots: {
    orderBy: { sortOrder: "asc" as const },
    select: {
      id: true,
      labelSnapshot: true,
      contentSnapshot: true,
      sortOrder: true,
    },
  },
} satisfies Prisma.AssignmentQuestionSelect;

function decimalNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

function teacherView(
  assignment: Prisma.AssignmentGetPayload<{
    include: typeof teacherAssignmentInclude;
  }>,
): TeacherAssignmentView {
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? "",
    status: assignment.status,
    classroom: assignment.classroom,
    totalPoints: assignment.totalPoints.toNumber(),
    allowResubmission: assignment.allowResubmission,
    publishedAt: assignment.publishedAt,
    dueAt: assignment.dueAt,
    questions: assignment.questions.map((question) => ({
      id: question.id,
      questionId: question.questionId,
      title: question.titleSnapshot,
      type: question.typeSnapshot,
      sortOrder: question.sortOrder,
      points: question.points.toNumber(),
    })),
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

async function assertAssignmentResources(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  input: AssignmentUpsertData,
) {
  const classroom = await transaction.classroom.findUnique({
    where: { id: input.classroomId },
    select: { teacherId: true, status: true },
  });
  assertTeacherOwnsClassroom(teacherId, classroom);

  const questionIds = input.questions.map((item) => item.questionId);
  const questions = await transaction.question.findMany({
    where: { id: { in: questionIds } },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      knowledgePointLinks: {
        include: { knowledgePoint: true },
      },
    },
  });
  if (
    questions.length !== questionIds.length ||
    questions.some((question) => !canTeacherUseQuestion(teacherId, question))
  ) {
    throw new AssignmentOperationError("部分题目不存在、已停用或无权使用", 400);
  }
  return new Map(questions.map((question) => [question.id, question]));
}

async function replaceQuestionSnapshots(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
  teacherId: string,
  input: AssignmentUpsertData,
): Promise<Prisma.Decimal> {
  const questions = await assertAssignmentResources(
    transaction,
    teacherId,
    input,
  );
  await transaction.assignmentQuestion.deleteMany({
    where: { assignmentId },
  });

  let totalPoints = new Prisma.Decimal(0);
  for (const item of [...input.questions].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  )) {
    const source = questions.get(item.questionId);
    if (!source) {
      throw new AssignmentOperationError("题目不存在", 400);
    }
    const points = new Prisma.Decimal(item.points);
    totalPoints = totalPoints.add(points);
    await transaction.assignmentQuestion.create({
      data: {
        assignmentId,
        questionId: source.id,
        sortOrder: item.sortOrder,
        points,
        titleSnapshot: source.title,
        contentSnapshot: source.content,
        typeSnapshot: source.type,
        difficultySnapshot: source.difficulty,
        explanationSnapshot: source.explanation,
        correctBooleanSnapshot: source.correctBoolean,
        referenceAnswerSnapshot: source.referenceAnswer,
        acceptableAnswersSnapshot: source.acceptableAnswers,
        isCaseSensitiveSnapshot: source.isCaseSensitive,
        gradingConfigSnapshot:
          source.gradingConfig === null
            ? Prisma.JsonNull
            : source.gradingConfig,
        optionSnapshots: {
          create: source.options.map((option) => ({
            sourceOptionId: option.id,
            labelSnapshot: option.label,
            contentSnapshot: option.content,
            isCorrectSnapshot: option.isCorrect,
            sortOrder: option.sortOrder,
          })),
        },
        knowledgePointSnapshots: {
          create: source.knowledgePointLinks.map((link) => ({
            knowledgePointId: link.knowledgePointId,
            codeSnapshot: link.knowledgePoint.code,
            nameSnapshot: link.knowledgePoint.name,
            weightSnapshot: link.weight,
          })),
        },
      },
    });
  }
  return totalPoints;
}

export async function getTeacherAssignmentEditorOptions(teacherId: string) {
  const [classrooms, questions] = await Promise.all([
    prisma.classroom.findMany({
      where: { teacherId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.question.findMany({
      where: {
        status: QuestionStatus.ACTIVE,
        deletedAt: null,
        OR: [
          { creatorId: teacherId },
          { visibility: QuestionVisibility.PUBLIC },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 500,
      select: {
        id: true,
        title: true,
        type: true,
        difficulty: true,
        visibility: true,
        creatorId: true,
      },
    }),
  ]);
  return {
    classrooms,
    questions: questions.map((question) => ({
      ...question,
      isOwned: question.creatorId === teacherId,
    })),
  };
}

export async function listTeacherAssignments(
  teacherId: string,
  query: AssignmentListQuery,
) {
  const where: Prisma.AssignmentWhereInput = {
    teacherId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [total, assignments] = await prisma.$transaction([
    prisma.assignment.count({ where }),
    prisma.assignment.findMany({
      where,
      include: teacherAssignmentInclude,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: assignments.map(teacherView),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getTeacherAssignment(
  teacherId: string,
  assignmentId: string,
): Promise<TeacherAssignmentView> {
  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId },
    include: teacherAssignmentInclude,
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
  return teacherView(assignment);
}

export async function createDraftAssignment(
  teacherId: string,
  input: AssignmentUpsertData,
): Promise<TeacherAssignmentView> {
  const assignmentId = await prisma.$transaction(async (transaction) => {
    await assertAssignmentResources(transaction, teacherId, input);
    const assignment = await transaction.assignment.create({
      data: {
        classroomId: input.classroomId,
        teacherId,
        title: input.title,
        description: input.description || null,
        allowResubmission: input.allowResubmission,
        publishedAt: input.publishedAt,
        dueAt: input.dueAt,
      },
      select: { id: true },
    });
    const totalPoints = await replaceQuestionSnapshots(
      transaction,
      assignment.id,
      teacherId,
      input,
    );
    await transaction.assignment.update({
      where: { id: assignment.id },
      data: { totalPoints },
    });
    return assignment.id;
  });
  return getTeacherAssignment(teacherId, assignmentId);
}

export async function updateDraftAssignment(
  teacherId: string,
  assignmentId: string,
  input: AssignmentUpsertData,
): Promise<TeacherAssignmentView> {
  await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.assignment.findUnique({
      where: { id: assignmentId },
      select: { teacherId: true, status: true },
    });
    assertDraftAssignment(teacherId, assignment);
    const totalPoints = await replaceQuestionSnapshots(
      transaction,
      assignmentId,
      teacherId,
      input,
    );
    await transaction.assignment.update({
      where: { id: assignmentId },
      data: {
        classroomId: input.classroomId,
        title: input.title,
        description: input.description || null,
        allowResubmission: input.allowResubmission,
        publishedAt: input.publishedAt,
        dueAt: input.dueAt,
        totalPoints,
      },
    });
  });
  return getTeacherAssignment(teacherId, assignmentId);
}

export async function publishAssignment(
  teacherId: string,
  assignmentId: string,
): Promise<TeacherAssignmentView> {
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    const assignment = await transaction.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        questions: {
          orderBy: { sortOrder: "asc" },
          select: { questionId: true, sortOrder: true, points: true },
        },
      },
    });
    assertDraftAssignment(teacherId, assignment);
    if (!assignment || assignment.questions.length === 0) {
      throw new AssignmentOperationError("发布作业前至少需要选择一道题", 400);
    }
    if (!assignment.publishedAt || !assignment.dueAt) {
      throw new AssignmentOperationError("发布时间和截止时间不能为空", 400);
    }
    if (assignment.dueAt <= assignment.publishedAt || assignment.dueAt <= now) {
      throw new AssignmentOperationError(
        "截止时间必须晚于发布时间和当前时间",
        400,
      );
    }
    const snapshotInput: AssignmentUpsertData = {
      title: assignment.title,
      description: assignment.description ?? "",
      classroomId: assignment.classroomId,
      publishedAt: assignment.publishedAt,
      dueAt: assignment.dueAt,
      allowResubmission: assignment.allowResubmission,
      questions: assignment.questions.map((question) => ({
        questionId: question.questionId,
        sortOrder: question.sortOrder,
        points: question.points.toNumber(),
      })),
    };
    const totalPoints = await replaceQuestionSnapshots(
      transaction,
      assignmentId,
      teacherId,
      snapshotInput,
    );
    await transaction.assignment.update({
      where: { id: assignmentId },
      data: { status: AssignmentStatus.PUBLISHED, totalPoints },
    });
  });
  return getTeacherAssignment(teacherId, assignmentId);
}

export async function listStudentAssignments(
  studentId: string,
): Promise<StudentAssignmentListItem[]> {
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      status: AssignmentStatus.PUBLISHED,
      publishedAt: { lte: now },
      classroom: {
        memberships: {
          some: { studentId, status: MembershipStatus.ACTIVE },
        },
      },
    },
    include: {
      classroom: { select: { name: true } },
      submissions: {
        where: { studentId, status: { not: SubmissionStatus.WITHDRAWN } },
        orderBy: { attemptNumber: "desc" },
        select: { id: true, status: true, attemptNumber: true },
      },
    },
    orderBy: [{ dueAt: "asc" }, { publishedAt: "desc" }],
  });
  return assignments.flatMap((assignment) => {
    if (!assignment.publishedAt || !assignment.dueAt) return [];
    const inProgress = assignment.submissions.find(
      (submission) => submission.status === SubmissionStatus.IN_PROGRESS,
    );
    const latest = assignment.submissions.find(
      (submission) => submission.status !== SubmissionStatus.IN_PROGRESS,
    );
    return [
      {
        id: assignment.id,
        title: assignment.title,
        description: assignment.description ?? "",
        classroomName: assignment.classroom.name,
        totalPoints: assignment.totalPoints.toNumber(),
        publishedAt: assignment.publishedAt,
        dueAt: assignment.dueAt,
        allowResubmission: assignment.allowResubmission,
        attemptCount: assignment.submissions.filter(
          (submission) => submission.status !== SubmissionStatus.IN_PROGRESS,
        ).length,
        inProgressSubmissionId: inProgress?.id ?? null,
        latestSubmissionId: latest?.id ?? null,
      },
    ];
  });
}

async function requireStudentAssignment(
  studentId: string,
  assignmentId: string,
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      classroom: {
        select: {
          name: true,
          memberships: {
            where: { studentId },
            select: { status: true },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: "asc" },
        select: studentQuestionSelect,
      },
      submissions: {
        where: { studentId, status: { not: SubmissionStatus.WITHDRAWN } },
        orderBy: { attemptNumber: "desc" },
        select: { id: true, status: true, attemptNumber: true },
      },
    },
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
  assertActiveMembership(assignment.classroom.memberships[0] ?? null);
  assertAssignmentIsVisible(assignment, new Date());
  return assignment;
}

export async function getStudentAssignment(
  studentId: string,
  assignmentId: string,
) {
  const assignment = await requireStudentAssignment(studentId, assignmentId);
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? "",
    classroomName: assignment.classroom.name,
    totalPoints: assignment.totalPoints.toNumber(),
    publishedAt: assignment.publishedAt,
    dueAt: assignment.dueAt,
    allowResubmission: assignment.allowResubmission,
    isExpired: !assignment.dueAt || assignment.dueAt <= new Date(),
    questions: assignment.questions.map((question) => ({
      id: question.id,
      title: question.titleSnapshot,
      content: question.contentSnapshot,
      type: question.typeSnapshot,
      sortOrder: question.sortOrder,
      points: question.points.toNumber(),
      options: question.optionSnapshots.map((option) => ({
        id: option.id,
        label: option.labelSnapshot,
        content: option.contentSnapshot,
        sortOrder: option.sortOrder,
      })),
    })),
    attempts: assignment.submissions,
  };
}

async function createAttempt(
  studentId: string,
  assignmentId: string,
  idempotencyKey: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const keyed = await transaction.submission.findUnique({
        where: { idempotencyKey },
        select: { id: true, studentId: true, assignmentId: true },
      });
      if (keyed) {
        if (
          keyed.studentId !== studentId ||
          keyed.assignmentId !== assignmentId
        ) {
          throw new AssignmentOperationError("幂等键已被其他作答使用", 409);
        }
        return keyed.id;
      }
      const assignment = await transaction.assignment.findUnique({
        where: { id: assignmentId },
        include: {
          classroom: {
            select: {
              memberships: {
                where: { studentId },
                select: { status: true },
              },
            },
          },
          submissions: {
            where: { studentId, status: { not: SubmissionStatus.WITHDRAWN } },
            orderBy: { attemptNumber: "desc" },
            select: { id: true, status: true, attemptNumber: true },
          },
        },
      });
      if (!assignment) throw new ResourceNotFoundError("作业不存在");
      assertActiveMembership(assignment.classroom.memberships[0] ?? null);
      assertAssignmentAcceptsWork(assignment, new Date());
      const inProgress = assignment.submissions.find(
        (submission) => submission.status === SubmissionStatus.IN_PROGRESS,
      );
      if (inProgress) return inProgress.id;
      const submittedCount = assignment.submissions.length;
      assertCanStartAttempt(assignment.allowResubmission, submittedCount);
      const attemptNumber =
        Math.max(
          0,
          ...assignment.submissions.map((item) => item.attemptNumber),
        ) + 1;
      const submission = await transaction.submission.create({
        data: {
          assignmentId,
          studentId,
          attemptNumber,
          idempotencyKey,
        },
        select: { id: true },
      });
      return submission.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function startOrResumeAttempt(
  studentId: string,
  assignmentId: string,
  idempotencyKey: string,
) {
  try {
    const submissionId = await createAttempt(
      studentId,
      assignmentId,
      idempotencyKey,
    );
    return getStudentSubmissionDraft(studentId, submissionId);
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const existing = await prisma.submission.findFirst({
        where: {
          assignmentId,
          studentId,
          OR: [{ idempotencyKey }, { status: SubmissionStatus.IN_PROGRESS }],
        },
        select: { id: true },
      });
      if (existing) return getStudentSubmissionDraft(studentId, existing.id);
    }
    throw error;
  }
}

const submissionDraftInclude = {
  assignment: {
    include: {
      classroom: {
        select: {
          memberships: {
            select: { studentId: true, status: true },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: "asc" as const },
        select: studentQuestionSelect,
      },
    },
  },
  answers: {
    include: {
      selectedOptions: {
        select: { assignmentQuestionOptionId: true },
      },
    },
  },
} satisfies Prisma.SubmissionInclude;

export async function getStudentSubmissionDraft(
  studentId: string,
  submissionId: string,
) {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, studentId },
    include: submissionDraftInclude,
  });
  if (!submission) throw new ResourceNotFoundError("作答记录不存在");
  const membership = submission.assignment.classroom.memberships.find(
    (item) => item.studentId === studentId,
  );
  assertActiveMembership(membership ?? null);
  assertAssignmentIsVisible(submission.assignment, new Date());
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    assignmentTitle: submission.assignment.title,
    attemptNumber: submission.attemptNumber,
    status: submission.status,
    version: submission.saveVersion,
    lastSavedAt: submission.lastSavedAt,
    dueAt: submission.assignment.dueAt,
    questions: submission.assignment.questions.map((question) => ({
      id: question.id,
      title: question.titleSnapshot,
      content: question.contentSnapshot,
      type: question.typeSnapshot,
      sortOrder: question.sortOrder,
      points: question.points.toNumber(),
      options: question.optionSnapshots.map((option) => ({
        id: option.id,
        label: option.labelSnapshot,
        content: option.contentSnapshot,
        sortOrder: option.sortOrder,
      })),
    })),
    answers: submission.answers.map((answer) => ({
      assignmentQuestionId: answer.assignmentQuestionId,
      textAnswer: answer.textAnswer,
      booleanAnswer: answer.booleanAnswer,
      optionIds: answer.selectedOptions.map(
        (selection) => selection.assignmentQuestionOptionId,
      ),
    })),
  };
}

function validateAnswerShape(
  question: {
    id: string;
    typeSnapshot: QuestionType;
    optionSnapshots: Array<{ id: string }>;
  },
  answer: SavedAnswerInput,
): void {
  if (answer.kind === "EMPTY") return;
  const expectedKind =
    question.typeSnapshot === QuestionType.SINGLE_CHOICE ||
    question.typeSnapshot === QuestionType.MULTIPLE_CHOICE
      ? "CHOICE"
      : question.typeSnapshot === QuestionType.TRUE_FALSE
        ? "BOOLEAN"
        : "TEXT";
  if (answer.kind !== expectedKind) {
    throw new AssignmentOperationError("答案类型与题型不匹配", 400);
  }
  if (answer.kind === "CHOICE") {
    if (
      question.typeSnapshot === QuestionType.SINGLE_CHOICE &&
      answer.optionIds.length > 1
    ) {
      throw new AssignmentOperationError("单选题只能选择一个选项", 400);
    }
    const validIds = new Set(
      question.optionSnapshots.map((option) => option.id),
    );
    if (answer.optionIds.some((optionId) => !validIds.has(optionId))) {
      throw new AssignmentOperationError("答案包含不属于该题的选项", 400);
    }
  }
}

export async function saveStudentAnswers(
  studentId: string,
  submissionId: string,
  input: AutosaveAnswersData,
) {
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const submission = await transaction.submission.findFirst({
      where: { id: submissionId, studentId },
      include: {
        assignment: {
          include: {
            classroom: {
              select: {
                memberships: {
                  where: { studentId },
                  select: { status: true },
                },
              },
            },
          },
        },
      },
    });
    if (!submission) throw new ResourceNotFoundError("作答记录不存在");
    assertActiveMembership(
      submission.assignment.classroom.memberships[0] ?? null,
    );
    assertAssignmentAcceptsWork(submission.assignment, now);
    if (submission.status !== SubmissionStatus.IN_PROGRESS) {
      throw new AssignmentOperationError("该作答已经提交，不能继续修改");
    }

    const answerQuestionIds = input.answers.map(
      (answer) => answer.assignmentQuestionId,
    );
    if (new Set(answerQuestionIds).size !== answerQuestionIds.length) {
      throw new AssignmentOperationError("同一道题不能重复保存", 400);
    }
    const questions = await transaction.assignmentQuestion.findMany({
      where: {
        assignmentId: submission.assignmentId,
        id: { in: answerQuestionIds },
      },
      include: { optionSnapshots: { select: { id: true } } },
    });
    if (questions.length !== answerQuestionIds.length) {
      throw new AssignmentOperationError("答案包含不属于该作业的题目", 400);
    }
    const questionMap = new Map(
      questions.map((question) => [question.id, question]),
    );
    for (const answer of input.answers) {
      const question = questionMap.get(answer.assignmentQuestionId);
      if (!question) {
        throw new AssignmentOperationError("作业题目不存在", 400);
      }
      validateAnswerShape(question, answer);
    }

    const versionUpdate = await transaction.submission.updateMany({
      where: {
        id: submissionId,
        studentId,
        status: SubmissionStatus.IN_PROGRESS,
        saveVersion: input.version,
      },
      data: { saveVersion: { increment: 1 }, lastSavedAt: now },
    });
    if (versionUpdate.count !== 1) {
      throw new AssignmentOperationError(
        "答案已在其他页面更新，请刷新后重试",
        409,
      );
    }

    for (const answer of input.answers) {
      const question = questionMap.get(answer.assignmentQuestionId);
      if (!question) continue;
      if (answer.kind === "EMPTY") {
        await transaction.studentAnswer.deleteMany({
          where: {
            submissionId,
            assignmentQuestionId: answer.assignmentQuestionId,
          },
        });
        continue;
      }
      const persisted = await transaction.studentAnswer.upsert({
        where: {
          submissionId_assignmentQuestionId: {
            submissionId,
            assignmentQuestionId: answer.assignmentQuestionId,
          },
        },
        update: {
          textAnswer: answer.kind === "TEXT" ? answer.value : null,
          booleanAnswer: answer.kind === "BOOLEAN" ? answer.value : null,
          responseTimeMs: answer.responseTimeMs,
          gradingStatus: GradingStatus.UNGRADED,
          score: null,
          isCorrect: null,
          gradedAt: null,
        },
        create: {
          submissionId,
          assignmentQuestionId: answer.assignmentQuestionId,
          textAnswer: answer.kind === "TEXT" ? answer.value : null,
          booleanAnswer: answer.kind === "BOOLEAN" ? answer.value : null,
          responseTimeMs: answer.responseTimeMs,
          maxScore: question.points,
        },
        select: { id: true },
      });
      await transaction.studentAnswerOption.deleteMany({
        where: { studentAnswerId: persisted.id },
      });
      if (answer.kind === "CHOICE" && answer.optionIds.length > 0) {
        await transaction.studentAnswerOption.createMany({
          data: answer.optionIds.map((assignmentQuestionOptionId) => ({
            studentAnswerId: persisted.id,
            assignmentQuestionOptionId,
          })),
        });
      }
    }
    return { version: input.version + 1, lastSavedAt: now };
  });
}

const gradingSubmissionInclude = {
  assignment: {
    include: {
      classroom: {
        select: {
          memberships: {
            select: { studentId: true, status: true },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: "asc" as const },
        include: {
          optionSnapshots: {
            select: { id: true, isCorrectSnapshot: true },
          },
        },
      },
    },
  },
  answers: {
    include: {
      selectedOptions: {
        select: { assignmentQuestionOptionId: true },
      },
    },
  },
} satisfies Prisma.SubmissionInclude;

function savedInputForQuestion(
  question: { id: string; typeSnapshot: QuestionType },
  answer:
    | {
        textAnswer: string | null;
        booleanAnswer: boolean | null;
        selectedOptions: Array<{ assignmentQuestionOptionId: string }>;
      }
    | undefined,
): SavedAnswerInput {
  if (!answer) return { assignmentQuestionId: question.id, kind: "EMPTY" };
  if (
    question.typeSnapshot === QuestionType.SINGLE_CHOICE ||
    question.typeSnapshot === QuestionType.MULTIPLE_CHOICE
  ) {
    return {
      assignmentQuestionId: question.id,
      kind: "CHOICE",
      optionIds: answer.selectedOptions.map(
        (selection) => selection.assignmentQuestionOptionId,
      ),
    };
  }
  if (question.typeSnapshot === QuestionType.TRUE_FALSE) {
    return answer.booleanAnswer === null
      ? { assignmentQuestionId: question.id, kind: "EMPTY" }
      : {
          assignmentQuestionId: question.id,
          kind: "BOOLEAN",
          value: answer.booleanAnswer,
        };
  }
  return answer.textAnswer === null
    ? { assignmentQuestionId: question.id, kind: "EMPTY" }
    : {
        assignmentQuestionId: question.id,
        kind: "TEXT",
        value: answer.textAnswer,
      };
}

export async function submitStudentAssignment(
  studentId: string,
  submissionId: string,
): Promise<SubmissionResultView> {
  for (
    let transactionAttempt = 0;
    transactionAttempt < 2;
    transactionAttempt += 1
  ) {
    try {
      await prisma.$transaction(
        async (transaction) => {
          const submission = await transaction.submission.findFirst({
            where: { id: submissionId, studentId },
            include: gradingSubmissionInclude,
          });
          if (!submission) throw new ResourceNotFoundError("作答记录不存在");
          if (submission.status !== SubmissionStatus.IN_PROGRESS) return;
          const membership = submission.assignment.classroom.memberships.find(
            (item) => item.studentId === studentId,
          );
          assertActiveMembership(membership ?? null);
          const now = new Date();
          assertAssignmentAcceptsWork(submission.assignment, now);
          const claimed = await transaction.submission.updateMany({
            where: {
              id: submissionId,
              studentId,
              status: SubmissionStatus.IN_PROGRESS,
            },
            data: { status: SubmissionStatus.SUBMITTED, submittedAt: now },
          });
          if (claimed.count !== 1) return;

          const answerMap = new Map(
            submission.answers.map((answer) => [
              answer.assignmentQuestionId,
              answer,
            ]),
          );
          let earned = new Prisma.Decimal(0);
          let requiresManualReview = false;
          for (const question of submission.assignment.questions) {
            const currentAnswer = answerMap.get(question.id);
            const savedInput = savedInputForQuestion(question, currentAnswer);
            const result = gradeAnswer(
              {
                type: question.typeSnapshot,
                points: question.points.toNumber(),
                correctBoolean: question.correctBooleanSnapshot,
                acceptableAnswers: question.acceptableAnswersSnapshot,
                isCaseSensitive: question.isCaseSensitiveSnapshot,
                options: question.optionSnapshots.map((option) => ({
                  id: option.id,
                  isCorrect: option.isCorrectSnapshot,
                })),
              },
              savedInput,
            );
            if (result.score !== null) earned = earned.add(result.score);
            if (result.gradingStatus === GradingStatus.MANUAL_REVIEW_REQUIRED) {
              requiresManualReview = true;
            }
            const persisted = await transaction.studentAnswer.upsert({
              where: {
                submissionId_assignmentQuestionId: {
                  submissionId,
                  assignmentQuestionId: question.id,
                },
              },
              update: {
                gradingStatus: result.gradingStatus,
                score: result.score,
                maxScore: question.points,
                isCorrect: result.isCorrect,
                gradedAt:
                  result.gradingStatus === GradingStatus.AUTO_GRADED
                    ? now
                    : null,
              },
              create: {
                submissionId,
                assignmentQuestionId: question.id,
                maxScore: question.points,
                gradingStatus: result.gradingStatus,
                score: result.score,
                isCorrect: result.isCorrect,
                gradedAt:
                  result.gradingStatus === GradingStatus.AUTO_GRADED
                    ? now
                    : null,
              },
              select: { id: true },
            });
            if (result.isCorrect === false) {
              await transaction.wrongQuestion.upsert({
                where: { studentAnswerId: persisted.id },
                update: { isResolved: false },
                create: {
                  studentId,
                  studentAnswerId: persisted.id,
                  assignmentQuestionId: question.id,
                },
              });
            }
          }
          const maxScore = submission.assignment.totalPoints;
          const percentage = maxScore.gt(0)
            ? earned.div(maxScore).mul(100).toDecimalPlaces(2)
            : new Prisma.Decimal(0);
          await transaction.submission.update({
            where: { id: submissionId },
            data: {
              status: requiresManualReview
                ? SubmissionStatus.PENDING_REVIEW
                : SubmissionStatus.GRADED,
              gradedAt: requiresManualReview ? null : now,
              score: earned,
              maxScore,
              percentage,
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (error: unknown) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        transactionAttempt === 1
      ) {
        throw error;
      }
    }
  }
  return getStudentSubmissionResult(studentId, submissionId);
}

export async function getStudentSubmissionResult(
  studentId: string,
  submissionId: string,
): Promise<SubmissionResultView> {
  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, studentId },
    include: {
      assignment: {
        include: {
          classroom: {
            select: {
              memberships: {
                where: { studentId },
                select: { status: true },
              },
            },
          },
        },
      },
      answers: {
        orderBy: { assignmentQuestion: { sortOrder: "asc" } },
        include: {
          assignmentQuestion: {
            select: { titleSnapshot: true, sortOrder: true },
          },
        },
      },
    },
  });
  if (!submission) throw new ResourceNotFoundError("提交结果不存在");
  assertActiveMembership(
    submission.assignment.classroom.memberships[0] ?? null,
  );
  if (submission.status === SubmissionStatus.IN_PROGRESS) {
    throw new AssignmentOperationError("作业尚未提交", 409);
  }
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    assignmentTitle: submission.assignment.title,
    attemptNumber: submission.attemptNumber,
    status: submission.status,
    submittedAt: submission.submittedAt,
    score: decimalNumber(submission.score),
    maxScore: decimalNumber(submission.maxScore),
    percentage: decimalNumber(submission.percentage),
    answers: submission.answers.map((answer) => ({
      assignmentQuestionId: answer.assignmentQuestionId,
      title: answer.assignmentQuestion.titleSnapshot,
      sortOrder: answer.assignmentQuestion.sortOrder,
      score: decimalNumber(answer.score),
      maxScore: answer.maxScore.toNumber(),
      isCorrect: answer.isCorrect,
      gradingStatus: answer.gradingStatus,
    })),
  };
}
