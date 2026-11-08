import { schoolQuestionAccessWhere } from "@/services/questions/access";
import { lockAssignmentLifecycle } from "./lifecycle-lock";
import { groupKnowledgeChapters } from "@/services/knowledge-graph/chapter-groups";
import {
  assignmentEditorClassroomWhere,
  canCopyHistoricalAssignment,
} from "./creation-context";
import { canRevokeAssignment } from "./draft-action";
import { EFFECTIVE_SUBMISSION_STATUSES } from "./reporting";
import { publishedResultsWhere } from "./work-access";
import {
  assertStudentWorkAccess,
  readStudentWorkAccess,
  bindMakeupDraft,
} from "./work-access";
import { assertClassroomWorkAllowed } from "./classroom-work";
import { assignmentSectionWhere } from "@/services/assignments/presentation";
import "server-only";
import { assignmentStatusWhere } from "./presentation";
import { createHash, randomUUID } from "node:crypto";
import {
  validateAssignmentResourceFiles,
  listAssignmentResourceFiles,
} from "@/services/assignments/resources";
import {
  assignmentTaskSchema,
  assignmentBatchSchema,
  type AssignmentBatchData,
} from "@/services/assignments/schemas";
import { buildEditorCourseOptions } from "@/services/assignments/editor-course-options";

import {
  AssignmentStatus,
  GradingStatus,
  MembershipStatus,
  Prisma,
  QuestionStatus,
  QuestionType,
  QuestionVisibility,
  Role,
  SubmissionStatus,
  UserStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  formatCorrectAnswer,
  formatStudentAnswer,
} from "@/services/assignments/answer-presentation";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  AssignmentOperationError,
  AssignmentRevokedError,
} from "@/services/assignments/errors";
import { gradeAnswer, savedAnswerInput } from "@/services/assignments/grading";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import {
  assertActiveMembership,
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
  SubmissionResultView,
  TeacherAssignmentView,
} from "@/services/assignments/types";
import { freezeAssignmentQuestionConcepts } from "@/services/concept-mastery/assignment-snapshot";
import { freezeAssignmentProgrammingConfigs } from "@/services/programming-questions/assignment-snapshot";
import { createFormalProgrammingAttempt } from "@/services/programming-attempts/service";
import { appendAssessmentLearningEventsAndProjectEvidence } from "@/services/learning-events/assessment";
import { notifyAssignmentPublished } from "@/services/notifications/events/assignment";

const teacherAssignmentInclude = {
  _count: {
    select: {
      gradeItems: true,
      sourceGradeRevisions: true,
      submissions: { where: publishedResultsWhere },
    },
  },
  classroom: { select: { id: true, name: true, status: true } },
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
  examImages: {
    orderBy: { sortOrder: "asc" as const },
    select: { id: true },
  },
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
    category: assignment.category,
    categoryNeedsReview: assignment.categoryNeedsReview,
    title: assignment.title,
    description: assignment.description ?? "",
    status: assignment.status,
    batchId: assignment.batchId ?? null,
    classroom: assignment.classroom,
    totalPoints: assignment.totalPoints.toNumber(),
    allowResubmission: assignment.allowResubmission,
    allowAttachments: assignment.allowAttachments,
    submissionTask:
      assignment.submissionTask as TeacherAssignmentView["submissionTask"],
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

export async function assertAssignmentResources(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  input: AssignmentUpsertData,
  assignmentId?: string,
  verifyStorage = false,
) {
  const classroom = await transaction.classroom.findUnique({
    where: { id: input.classroomId },
    select: {
      teacherId: true,
      status: true,
      courseId: true,
      course: { select: { questionCategoryId: true } },
    },
  });
  assertTeacherOwnsClassroom(teacherId, classroom);
  if (!classroom) {
    throw new AssignmentOperationError("班级不存在或无权访问", 400);
  }
  await validateAssignmentResourceFiles(
    transaction,
    teacherId,
    classroom.courseId,
    input.submissionTask?.resourceFileIds ?? [],
    verifyStorage,
  );

  const questionIds = input.questions.map((item) => item.questionId);
  const questions = await transaction.question.findMany({
    where: {
      ...schoolQuestionAccessWhere(teacherId),
      id: { in: questionIds },
      OR: [
        { isAssignmentOnly: false },
        ...(assignmentId
          ? [
              {
                isAssignmentOnly: true,
                assignmentQuestions: { some: { assignmentId } },
              },
            ]
          : []),
      ],
    },
    include: {
      options: { orderBy: { sortOrder: "asc" } },
      knowledgePointLinks: {
        include: { knowledgePoint: true },
      },
    },
  });
  if (
    questions.length !== questionIds.length ||
    questions.some(
      (question) =>
        !canTeacherUseQuestion(question) ||
        (classroom.course &&
          // Private task sources are scoped to this owned assignment by the query above.
          !(question.isAssignmentOnly && question.creatorId === teacherId) &&
          question.questionCategoryId !== classroom.course.questionCategoryId),
    )
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
  if (input.submissionTask) {
    const task = input.submissionTask;
    const existing = await transaction.assignmentQuestion.findFirst({
      where: { assignmentId, sourceQuestion: { isAssignmentOnly: true } },
      select: { questionId: true },
    });
    const data = {
      creatorId: teacherId,
      title: input.title,
      content: task.prompt,
      type: QuestionType.SHORT_ANSWER,
      visibility: QuestionVisibility.PRIVATE,
      status: QuestionStatus.ACTIVE,
      explanation: "",
      referenceAnswer: task.referenceAnswer,
      isAssignmentOnly: true,
    };
    const source = existing
      ? await transaction.question.update({
          where: { id: existing.questionId },
          data,
        })
      : await transaction.question.create({ data });
    input = {
      ...input,
      questions: [{ questionId: source.id, sortOrder: 1, points: task.points }],
    };
    // A new private task is authorized by its creator before its first snapshot exists.
    if (!existing)
      await transaction.assignmentQuestion.create({
        data: {
          assignmentId,
          questionId: source.id,
          sortOrder: 1,
          points: task.points,
          titleSnapshot: source.title,
          contentSnapshot: source.content,
          typeSnapshot: source.type,
          difficultySnapshot: null,
          explanationSnapshot: "",
          referenceAnswerSnapshot: source.referenceAnswer,
          acceptableAnswersSnapshot: [],
          isCaseSensitiveSnapshot: false,
        },
      });
  }
  const questions = await assertAssignmentResources(
    transaction,
    teacherId,
    input,
    assignmentId,
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
        difficultySnapshot: null,
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
  const [classrooms, questions, courses] = await Promise.all([
    prisma.classroom.findMany({
      where: assignmentEditorClassroomWhere(teacherId),
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        courseId: true,
        course: { select: { questionCategoryId: true } },
      },
    }),
    prisma.question.findMany({
      where: {
        ...schoolQuestionAccessWhere(teacherId),
        status: QuestionStatus.ACTIVE,
        isAssignmentOnly: false,
        deletedAt: null,
        questionCategoryId: { not: null },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        questionCategoryId: true,
        questionCategory: { select: { name: true } },
        graphBindings: {
          where: { course: { teacherId } },
          select: { courseId: true, conceptId: true },
        },
      },
    }),
    prisma.course.findMany({
      where: { teacherId, status: { not: "ARCHIVED" } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        templateId: true,
        name: true,
        term: true,
        courseNo: true,
        currentPublishedKnowledgeGraphVersion: {
          select: {
            nodes: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                conceptId: true,
                code: true,
                name: true,
                nodeType: true,
                sortOrder: true,
              },
            },
            edges: {
              where: { relationType: "CONTAINS" },
              select: { fromNodeId: true, toNodeId: true },
            },
          },
        },
      },
    }),
  ]);
  return {
    classrooms: classrooms.map(({ course, ...classroom }) => ({
      ...classroom,
      questionCategoryId: course?.questionCategoryId ?? null,
    })),
    assemblyChapters: Object.fromEntries(
      courses.flatMap((course) => {
        const graph = course.currentPublishedKnowledgeGraphVersion;
        return graph
          ? [
              [
                course.id,
                groupKnowledgeChapters(graph.nodes, graph.edges),
              ] as const,
            ]
          : [];
      }),
    ),
    publicationCourses: courses.map(({ id, name, term }) => ({
      id,
      name,
      term,
    })),
    courses: buildEditorCourseOptions(
      courses,
      new Set(
        questions.flatMap((question) =>
          question.graphBindings.map((binding) => binding.courseId),
        ),
      ),
    ),
    questions: questions.map((question) => ({
      ...question,
    })),
  };
}

export async function listTeacherAssignments(
  teacherId: string,
  query: AssignmentListQuery,
) {
  if (query.courseId) {
    const course = await prisma.course.findFirst({
      where: { id: query.courseId, teacherId },
      select: { id: true },
    });
    if (!course) throw new ResourceNotFoundError("课程或班级不存在");
    if (query.classroomId) {
      const classroom = await prisma.classroom.findFirst({
        where: { id: query.classroomId, teacherId, courseId: query.courseId },
        select: { id: true },
      });
      if (!classroom) throw new ResourceNotFoundError("课程或班级不存在");
    }
  }
  const where: Prisma.AssignmentWhereInput = {
    teacherId,
    examSessionId: null,
    deletedAt: null,
    ...(query.category ? { category: query.category } : {}),
    ...(query.courseId
      ? { classroom: { courseId: query.courseId, teacherId } }
      : {}),
    AND: [
      assignmentSectionWhere(query.section),
      query.status ? assignmentStatusWhere(query.status) : {},
    ],
    ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    ...(query.keyword
      ? { title: { contains: query.keyword, mode: "insensitive" } }
      : {}),
  };
  const orderBy: Prisma.AssignmentOrderByWithRelationInput[] =
    query.sort === "PUBLISHED_DESC"
      ? [{ publishedAt: "desc" }, { id: "desc" }]
      : query.sort === "DUE_ASC"
        ? [{ dueAt: "asc" }, { id: "asc" }]
        : query.sort === "DUE_DESC"
          ? [{ dueAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }];
  const [total, assignments, historyStatuses, classroomGroups] =
    await prisma.$transaction([
      prisma.assignment.count({ where }),
      prisma.assignment.findMany({
        where,
        include: teacherAssignmentInclude,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.assignment.groupBy({
        by: ["status"],
        orderBy: { status: "asc" },
        where: {
          teacherId,
          examSessionId: null,
          deletedAt: null,
          AND: [assignmentSectionWhere(query.section)],
          status: { in: ["CLOSED", "ARCHIVED", "REVOKED"] },
          ...(query.courseId
            ? { classroom: { courseId: query.courseId, teacherId } }
            : {}),
          ...(query.classroomId ? { classroomId: query.classroomId } : {}),
        },
      }),
      prisma.assignment.groupBy({
        by: ["classroomId"],
        orderBy: { classroomId: "asc" },
        where: {
          teacherId,
          examSessionId: null,
          deletedAt: null,
          AND: [assignmentSectionWhere(query.section)],
          ...(query.courseId
            ? { classroom: { courseId: query.courseId, teacherId } }
            : {}),
        },
      }),
    ]);
  const eligible = assignments.filter(
    (assignment) =>
      canRevokeAssignment(assignment) &&
      Object.values(assignment._count).every((count) => count === 0),
  );
  const submissionCounts = new Map(
    eligible.map((assignment) => [assignment.id, 0]),
  );
  if (eligible.length) {
    const groups = await prisma.submission.groupBy({
      by: ["assignmentId", "studentId"],
      where: {
        assignmentId: { in: eligible.map((assignment) => assignment.id) },
        status: { in: EFFECTIVE_SUBMISSION_STATUSES },
      },
    });
    for (const group of groups)
      submissionCounts.set(
        group.assignmentId,
        (submissionCounts.get(group.assignmentId) ?? 0) + 1,
      );
  }
  return {
    items: assignments.map((assignment) => ({
      ...teacherView(assignment),
      revocableSubmissionCount: submissionCounts.get(assignment.id),
    })),
    availableClassroomIds: classroomGroups.map((item) => item.classroomId),
    availableHistoryStatuses: historyStatuses.map((item) => item.status),
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
    where: { id: assignmentId, teacherId, deletedAt: null },
    include: teacherAssignmentInclude,
  });
  if (!assignment) throw new ResourceNotFoundError("作业不存在");
  return {
    ...teacherView(assignment),
    resourceFiles: await listAssignmentResourceFiles(
      { id: teacherId, role: Role.TEACHER },
      assignmentId,
    ),
  };
}

export interface AssignmentBatchMember {
  id: string;
  classroomId: string;
  classroomName: string;
  classroomStatus: string;
  status: AssignmentStatus;
}

/**
 * 读取与指定作业同批的成员（含自身）。历史单班作业没有 batchId，返回空 members，
 * 编辑页据此决定是否提示「本次修改会同时保存到多个班级」。
 */
export async function getAssignmentBatchDrafts(
  teacherId: string,
  assignmentId: string,
): Promise<{
  batchId: string | null;
  members: AssignmentBatchMember[];
}> {
  const current = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId, deletedAt: null },
    select: { batchId: true },
  });
  if (!current) throw new ResourceNotFoundError("作业不存在");
  if (!current.batchId) return { batchId: null, members: [] };
  const rows = await prisma.assignment.findMany({
    where: { teacherId, batchId: current.batchId, deletedAt: null },
    select: {
      id: true,
      classroomId: true,
      status: true,
      classroom: { select: { name: true, status: true } },
    },
    orderBy: [{ classroomId: "asc" }, { id: "asc" }],
  });
  return {
    batchId: current.batchId,
    members: rows.map((row) => ({
      id: row.id,
      classroomId: row.classroomId,
      classroomName: row.classroom.name,
      classroomStatus: row.classroom.status,
      status: row.status,
    })),
  };
}

export async function createDraftInTransaction(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  input: AssignmentUpsertData,
  fixedId?: string,
  batchId?: string | null,
): Promise<string> {
  await assertAssignmentResources(transaction, teacherId, input);
  const assignment = await transaction.assignment.create({
    data: {
      ...(fixedId ? { id: fixedId } : {}),
      classroomId: input.classroomId,
      teacherId,
      ...(batchId ? { batchId } : {}),
      category: input.category ?? "PRACTICE",
      title: input.title,
      description: input.description || null,
      allowResubmission: input.allowResubmission,
      allowAttachments: input.allowAttachments ?? false,
      submissionTask: input.submissionTask ?? Prisma.DbNull,
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
}

export async function copyHistoricalAssignment(
  teacherId: string,
  assignmentId: string,
  requestId: string,
  classroomId?: string,
) {
  const id =
    "c" +
    createHash("sha256")
      .update(`revoked-copy:${teacherId}:${assignmentId}:${requestId}`)
      .digest("hex")
      .slice(0, 24);
  await runAssignmentSerializable(async (tx) => {
    await lockAssignmentLifecycle(tx, assignmentId, teacherId);
    const source = await tx.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      include: teacherAssignmentInclude,
    });
    if (
      classroomId
        ? !canCopyHistoricalAssignment(source)
        : source.status !== "REVOKED" || source.classroom.status !== "ACTIVE"
    )
      throw new AssignmentOperationError(
        "仅可复制已开放且已截止或转入历史的作业",
      );
    const targetId = classroomId ?? source.classroomId;
    await tx.$queryRaw`SELECT id FROM "Classroom" WHERE id = ${targetId} AND "teacherId" = ${teacherId} FOR SHARE`;
    const target = await tx.classroom.findFirst({
      where: { ...assignmentEditorClassroomWhere(teacherId), id: targetId },
      select: { id: true },
    });
    if (!target) throw new ResourceNotFoundError("班级不存在");
    const existing = await tx.assignment.findUnique({
      where: { id },
      select: { status: true, deletedAt: true, classroomId: true },
    });
    if (existing) {
      if (
        existing.deletedAt ||
        existing.status !== "DRAFT" ||
        existing.classroomId !== targetId
      )
        throw new AssignmentOperationError("此复制请求已处理，请重新发起");
      return;
    }
    const task = source.submissionTask
      ? assignmentTaskSchema.parse(source.submissionTask)
      : undefined;
    await createDraftInTransaction(
      tx,
      teacherId,
      {
        category: source.category,
        classroomId: targetId,
        title: `${source.title.slice(0, 116)}（副本）`,
        description: source.description ?? "",
        allowResubmission: source.allowResubmission,
        allowAttachments: source.allowAttachments,
        submissionTask: task,
        questions: task
          ? []
          : source.questions.map((question) => ({
              questionId: question.questionId,
              sortOrder: question.sortOrder,
              points: question.points.toNumber(),
            })),
      },
      id,
    );
  }, "复制请求发生冲突，请重试");
  return { assignmentId: id };
}

export async function copyRevokedAssignment(
  teacherId: string,
  assignmentId: string,
  requestId: string,
) {
  return {
    action: "COPY_REVOKED" as const,
    ...(await copyHistoricalAssignment(teacherId, assignmentId, requestId)),
  };
}

export async function createDraftAssignment(
  teacherId: string,
  input: AssignmentUpsertData,
): Promise<TeacherAssignmentView> {
  const assignmentId = await prisma.$transaction((transaction) =>
    createDraftInTransaction(transaction, teacherId, input),
  );
  return getTeacherAssignment(teacherId, assignmentId);
}

export async function updateDraftAssignment(
  teacherId: string,
  assignmentId: string,
  input: AssignmentUpsertData,
): Promise<TeacherAssignmentView> {
  await runAssignmentSerializable(async (transaction) => {
    await lockAssignmentLifecycle(transaction, assignmentId, teacherId);
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
        ...(input.category ? { category: input.category } : {}),
        title: input.title,
        description: input.description || null,
        allowResubmission: input.allowResubmission,
        allowAttachments: input.allowAttachments ?? false,
        submissionTask: input.submissionTask ?? Prisma.DbNull,
        publishedAt: input.publishedAt,
        dueAt: input.dueAt,
        totalPoints,
      },
    });
  }, "作业已被其他操作更新，请刷新后重试");
  return getTeacherAssignment(teacherId, assignmentId);
}

/**
 * 一次编辑、一次提交，把同一份内容写入同批的全部草稿。
 * 单班作业（无 batchId）直接回退到原有单条更新，行为保持不变。
 */
export async function updateDraftAssignmentBatch(
  teacherId: string,
  assignmentId: string,
  input: AssignmentUpsertData,
  options: { applyToBatch?: boolean } = {},
): Promise<{ primary: TeacherAssignmentView; updatedIds: string[] }> {
  const applyToBatch = options.applyToBatch ?? true;
  const current = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId, deletedAt: null },
    select: { batchId: true },
  });
  if (!applyToBatch || !current?.batchId) {
    const primary = await updateDraftAssignment(teacherId, assignmentId, input);
    return { primary, updatedIds: [assignmentId] };
  }
  const batchId = current.batchId;
  const updatedIds = await runAssignmentSerializable(async (transaction) => {
    await lockAssignmentLifecycle(transaction, assignmentId, teacherId);
    const targets = await transaction.assignment.findMany({
      where: {
        teacherId,
        batchId,
        status: AssignmentStatus.DRAFT,
        deletedAt: null,
      },
      select: { id: true, classroomId: true },
      orderBy: [{ id: "asc" }],
    });
    if (!targets.length)
      throw new AssignmentOperationError("同批作业都已发布，无法继续编辑", 409);
    for (const target of targets) {
      await lockAssignmentLifecycle(transaction, target.id, teacherId);
      const totalPoints = await replaceQuestionSnapshots(
        transaction,
        target.id,
        teacherId,
        { ...input, classroomId: target.classroomId },
      );
      await transaction.assignment.update({
        where: { id: target.id },
        data: {
          ...(input.category ? { category: input.category } : {}),
          title: input.title,
          description: input.description || null,
          allowResubmission: input.allowResubmission,
          allowAttachments: input.allowAttachments ?? false,
          submissionTask: input.submissionTask ?? Prisma.DbNull,
          publishedAt: input.publishedAt,
          dueAt: input.dueAt,
          totalPoints,
        },
      });
    }
    return targets.map((target) => target.id);
  }, "同批作业正在保存，请使用原请求重试");
  return {
    primary: await getTeacherAssignment(teacherId, assignmentId),
    updatedIds,
  };
}

export async function publishInTransaction(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  assignmentId: string,
) {
  const now = new Date();

  const assignment = await transaction.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      teacher: {
        select: {
          email: true,
          profile: { select: { displayName: true } },
        },
      },
      classroom: {
        select: {
          status: true,
          courseId: true,
          memberships: {
            where: {
              status: MembershipStatus.ACTIVE,
              student: {
                role: Role.STUDENT,
                status: UserStatus.ACTIVE,
              },
            },
            select: { studentId: true },
          },
        },
      },
      questions: {
        orderBy: { sortOrder: "asc" },
        select: { questionId: true, sortOrder: true, points: true },
      },
    },
  });
  if (
    !assignment ||
    assignment.teacherId !== teacherId ||
    assignment.deletedAt
  ) {
    throw new ResourceNotFoundError("作业不存在");
  }
  if (assignment.status === AssignmentStatus.PUBLISHED) return;
  assertDraftAssignment(teacherId, assignment);
  if (assignment.questions.length === 0) {
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
  const task = assignment.submissionTask
    ? assignmentTaskSchema.parse(assignment.submissionTask)
    : undefined;
  await validateAssignmentResourceFiles(
    transaction,
    teacherId,
    assignment.classroom.courseId,
    task?.resourceFileIds ?? [],
  );
  const snapshotInput: AssignmentUpsertData = {
    category: assignment.category,
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
  await freezeAssignmentQuestionConcepts(
    transaction,
    assignmentId,
    assignment.classroom.courseId,
  );
  await freezeAssignmentProgrammingConfigs(transaction, assignmentId);
  await transaction.assignment.update({
    where: { id: assignmentId },
    data: { status: AssignmentStatus.PUBLISHED, totalPoints },
  });
  await notifyAssignmentPublished(
    {
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      publicationKey: randomUUID(),
      teacherName:
        assignment.teacher.profile?.displayName ??
        assignment.teacher.email ??
        "",
      dueAt: assignment.dueAt,
      recipientIds: assignment.classroom.memberships.map(
        (membership) => membership.studentId,
      ),
    },
    transaction,
  );
}

export async function publishAssignment(
  teacherId: string,
  assignmentId: string,
): Promise<TeacherAssignmentView> {
  await runAssignmentSerializable(async (transaction) => {
    await lockAssignmentLifecycle(transaction, assignmentId, teacherId);
    await publishInTransaction(transaction, teacherId, assignmentId);
  }, "作业发布状态已发生变化，请刷新后重试");
  return getTeacherAssignment(teacherId, assignmentId);
}

/**
 * 一次发布同批全部草稿。单班作业回退到原有发布流程。
 */
export async function publishAssignmentBatch(
  teacherId: string,
  assignmentId: string,
): Promise<{ primary: TeacherAssignmentView; publishedIds: string[] }> {
  const current = await prisma.assignment.findFirst({
    where: { id: assignmentId, teacherId, deletedAt: null },
    select: { batchId: true },
  });
  if (!current?.batchId) {
    const primary = await publishAssignment(teacherId, assignmentId);
    return { primary, publishedIds: [assignmentId] };
  }
  const batchId = current.batchId;
  const publishedIds = await runAssignmentSerializable(async (transaction) => {
    await lockAssignmentLifecycle(transaction, assignmentId, teacherId);
    const drafts = await transaction.assignment.findMany({
      where: {
        teacherId,
        batchId,
        status: AssignmentStatus.DRAFT,
        deletedAt: null,
      },
      select: { id: true },
      orderBy: [{ id: "asc" }],
    });
    if (!drafts.length)
      throw new AssignmentOperationError("同批作业已发布，请刷新后查看", 409);
    for (const draft of drafts)
      await publishInTransaction(transaction, teacherId, draft.id);
    return drafts.map((draft) => draft.id);
  }, "同批作业正在发布，请使用原请求重试");
  return {
    primary: await getTeacherAssignment(teacherId, assignmentId),
    publishedIds,
  };
}

export {
  listStudentAssignments,
  listStudentAssignmentPage,
  listStudentPendingAssignments,
  studentAssignmentActionContexts,
} from "./student-list";

async function requireStudentAssignment(
  studentId: string,
  assignmentId: string,
) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      classroom: {
        select: {
          status: true,
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
  const work = await readStudentWorkAccess(assignmentId, studentId);
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? "",
    classroomName: assignment.classroom.name,
    totalPoints: assignment.totalPoints.toNumber(),
    publishedAt: assignment.publishedAt,
    dueAt: assignment.dueAt,
    allowResubmission: assignment.allowResubmission,
    isExpired: !work.canWrite,
    canWrite:
      work.canWrite &&
      (Boolean(work.grant) ||
        assignment.allowResubmission ||
        assignment.submissions.every(
          (item) => item.status === SubmissionStatus.IN_PROGRESS,
        )),
    writeBlockedReason: work.reason,
    effectiveDueAt: work.dueAt,
    makeupKind: work.grant?.kind ?? null,
    questions: assignment.questions.map((question) => ({
      id: question.id,
      title: question.titleSnapshot,
      content: question.contentSnapshot,
      type: question.typeSnapshot,
      sortOrder: question.sortOrder,
      points: question.points.toNumber(),
      images: question.examImages.map((image) => ({
        id: image.id,
        url: `/api/assignment-question-images/${image.id}`,
      })),
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
  return runAssignmentSerializable(async (transaction) => {
    const keyed = await transaction.submission.findUnique({
      where: { idempotencyKey },
      select: { id: true, studentId: true, assignmentId: true },
    });
    const assignment = await transaction.assignment.findUnique({
      where: { id: assignmentId },
      include: {
        classroom: {
          select: {
            status: true,
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
    const work = await assertStudentWorkAccess(
      transaction,
      assignmentId,
      studentId,
    );
    await assertClassroomWorkAllowed(transaction, assignment.classroomId);
    if (keyed) {
      if (
        keyed.studentId !== studentId ||
        keyed.assignmentId !== assignmentId
      ) {
        throw new AssignmentOperationError("幂等键已被其他作答使用", 409);
      }
      return keyed.id;
    }

    const submittedCount = assignment.submissions.filter(
      (item) => item.status !== SubmissionStatus.IN_PROGRESS,
    ).length;
    if (!work.grant)
      assertCanStartAttempt(assignment.allowResubmission, submittedCount);
    const inProgress = assignment.submissions.find(
      (item) => item.status === SubmissionStatus.IN_PROGRESS,
    );
    if (inProgress) {
      if (work.grant)
        await bindMakeupDraft(transaction, work.grant.id, inProgress.id);
      return inProgress.id;
    }
    const sequence = await transaction.submission.aggregate({
      where: { assignmentId, studentId },
      _max: { attemptNumber: true },
    });
    const attemptNumber = (sequence._max.attemptNumber ?? 0) + 1;
    const submission = await transaction.submission.create({
      data: {
        assignmentId,
        studentId,
        attemptNumber,
        idempotencyKey,
      },
      select: { id: true },
    });
    if (work.grant)
      await bindMakeupDraft(transaction, work.grant.id, submission.id);
    return submission.id;
  }, "开始作答发生并发冲突，请重试");
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
          status: true,
          courseId: true,
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
  if (submission.assignment.status === "REVOKED")
    throw new AssignmentRevokedError();
  if (submission.assignment.classroom.status !== "ACTIVE")
    throw new AssignmentOperationError(
      "班级已结课或已关闭，请返回作业页面查看历史提交与成绩",
    );
  assertAssignmentIsVisible(submission.assignment, new Date());
  const work = await readStudentWorkAccess(
    submission.assignmentId,
    studentId,
    submission.id,
  );
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    assignmentTitle: submission.assignment.title,
    allowAttachments: submission.assignment.allowAttachments,
    attemptNumber: submission.attemptNumber,
    status: submission.status,
    version: submission.saveVersion,
    lastSavedAt: submission.lastSavedAt,
    dueAt: work.dueAt,
    canWrite: work.canWrite,
    writeBlockedReason: work.reason,
    makeupKind: work.grant?.kind ?? null,
    questions: submission.assignment.questions.map((question) => ({
      id: question.id,
      title: question.titleSnapshot,
      content: question.contentSnapshot,
      type: question.typeSnapshot,
      sortOrder: question.sortOrder,
      points: question.points.toNumber(),
      images: question.examImages.map((image) => ({
        id: image.id,
        url: `/api/assignment-question-images/${image.id}`,
      })),
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
      responseTimeMs: answer.responseTimeMs,
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
        : question.typeSnapshot === QuestionType.PYTHON_PROGRAMMING
          ? "CODE"
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
                status: true,
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
    await assertStudentWorkAccess(
      transaction,
      submission.assignmentId,
      studentId,
      submissionId,
    );
    await assertClassroomWorkAllowed(
      transaction,
      submission.assignment.classroomId,
    );
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
        if (answer.responseTimeMs === undefined) {
          await transaction.studentAnswer.deleteMany({
            where: {
              submissionId,
              assignmentQuestionId: answer.assignmentQuestionId,
            },
          });
        } else {
          const persisted = await transaction.studentAnswer.upsert({
            where: {
              submissionId_assignmentQuestionId: {
                submissionId,
                assignmentQuestionId: answer.assignmentQuestionId,
              },
            },
            update: {
              textAnswer: null,
              booleanAnswer: null,
              responseTimeMs: answer.responseTimeMs,
              gradingStatus: GradingStatus.UNGRADED,
              score: null,
              isCorrect: null,
              gradedAt: null,
            },
            create: {
              submissionId,
              assignmentQuestionId: answer.assignmentQuestionId,
              responseTimeMs: answer.responseTimeMs,
              maxScore: question.points,
            },
            select: { id: true },
          });
          await transaction.studentAnswerOption.deleteMany({
            where: { studentAnswerId: persisted.id },
          });
        }
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
          textAnswer:
            answer.kind === "TEXT" || answer.kind === "CODE"
              ? answer.value
              : null,
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
          textAnswer:
            answer.kind === "TEXT" || answer.kind === "CODE"
              ? answer.value
              : null,
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
          status: true,
          courseId: true,
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

export async function submitStudentAssignment(
  studentId: string,
  submissionId: string,
  mode: "STUDENT" | "EXAM_AUTO" = "STUDENT",
): Promise<SubmissionResultView> {
  await runAssignmentSerializable(async (transaction) => {
    const submission = await transaction.submission.findFirst({
      where: { id: submissionId, studentId },
      include: gradingSubmissionInclude,
    });
    if (!submission) throw new ResourceNotFoundError("作答记录不存在");
    if (submission.status !== SubmissionStatus.IN_PROGRESS) return;
    const membership = submission.assignment.classroom.memberships.find(
      (item) => item.studentId === studentId,
    );
    if (mode === "STUDENT") assertActiveMembership(membership ?? null);
    const work =
      mode === "STUDENT"
        ? await assertStudentWorkAccess(
            transaction,
            submission.assignmentId,
            studentId,
            submissionId,
          )
        : { grant: null };
    const now = new Date();
    if (mode === "EXAM_AUTO") {
      const exam = await transaction.examSession.findFirst({
        where: {
          assignments: { some: { id: submission.assignmentId } },
          cancelledAt: null,
        },
      });
      if (!exam) throw new ResourceNotFoundError("考试作答不存在");
      const switches = await transaction.examSwitchEvent.count({
        where: { submissionId },
      });
      if (now < exam.endsAt && switches <= exam.allowedSwitches)
        throw new AssignmentOperationError("尚未达到考试自动交卷条件", 409);
    } else {
      await assertClassroomWorkAllowed(
        transaction,
        submission.assignment.classroomId,
      );
    }
    const claimed = await transaction.submission.updateMany({
      where: {
        id: submissionId,
        studentId,
        status: SubmissionStatus.IN_PROGRESS,
      },
      data: { status: SubmissionStatus.SUBMITTED, submittedAt: now },
    });
    if (claimed.count !== 1) return;
    if (work.grant) {
      const consumed = await transaction.assignmentMakeupGrant.updateMany({
        where: {
          id: work.grant.id,
          status: "ACTIVE",
          expiresAt: { gt: now },
          submissionId,
        },
        data: { status: "USED", usedAt: now },
      });
      if (consumed.count !== 1)
        throw new AssignmentOperationError("补交授权已失效，请刷新后重试", 409);
    }

    const answerMap = new Map(
      submission.answers.map((answer) => [answer.assignmentQuestionId, answer]),
    );
    let earned = new Prisma.Decimal(0);
    let requiresManualReview = false;
    const answerIds: string[] = [];
    for (const question of submission.assignment.questions) {
      const currentAnswer = answerMap.get(question.id);
      const savedInput = savedAnswerInput(
        { id: question.id, type: question.typeSnapshot },
        currentAnswer,
      );
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
      if (question.typeSnapshot === QuestionType.PYTHON_PROGRAMMING) {
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
            result.gradingStatus === GradingStatus.AUTO_GRADED ? now : null,
        },
        create: {
          submissionId,
          assignmentQuestionId: question.id,
          maxScore: question.points,
          gradingStatus: result.gradingStatus,
          score: result.score,
          isCorrect: result.isCorrect,
          gradedAt:
            result.gradingStatus === GradingStatus.AUTO_GRADED ? now : null,
        },
        select: { id: true },
      });
      answerIds.push(persisted.id);
      if (question.typeSnapshot === QuestionType.PYTHON_PROGRAMMING) {
        await createFormalProgrammingAttempt(transaction, {
          studentAnswerId: persisted.id,
          assignmentQuestionId: question.id,
          studentId,
          sourceCode: currentAnswer?.textAnswer ?? "",
          courseId: submission.assignment.classroom.courseId,
        });
      }
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
        publishedAt: null,
        score: earned,
        maxScore,
        percentage,
      },
    });
    await appendAssessmentLearningEventsAndProjectEvidence(
      transaction,
      answerIds,
    );
  }, "提交状态已发生变化，请刷新后重试");
  return getStudentSubmissionResult(studentId, submissionId);
}

export async function getStudentSubmissionResult(
  studentId: string,
  submissionId: string,
): Promise<SubmissionResultView> {
  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      studentId,
      status: {
        in: [
          SubmissionStatus.SUBMITTED,
          SubmissionStatus.PENDING_REVIEW,
          SubmissionStatus.GRADED,
          SubmissionStatus.PUBLISHED,
        ],
      },
    },
    include: {
      assignment: {
        select: {
          title: true,
          status: true,
          classroom: {
            select: {
              memberships: {
                where: { studentId, status: "ACTIVE" },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
      attachments: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          assignmentQuestionId: true,
          originalName: true,
          sizeBytes: true,
        },
      },
      answers: {
        orderBy: { assignmentQuestion: { sortOrder: "asc" } },
        include: {
          programmingAttempts: {
            where: { kind: "FORMAL_JUDGE" },
            orderBy: { revisionNumber: "desc" },
            take: 1,
            select: { id: true, assignmentQuestionId: true, status: true },
          },
          selectedOptions: {
            orderBy: { assignmentQuestionOption: { sortOrder: "asc" } },
            select: {
              assignmentQuestionOption: {
                select: {
                  labelSnapshot: true,
                  contentSnapshot: true,
                },
              },
            },
          },
          assignmentQuestion: {
            include: {
              examImages: { orderBy: { sortOrder: "asc" } },
              optionSnapshots: { orderBy: { sortOrder: "asc" } },
              knowledgePointSnapshots: {
                orderBy: [{ nameSnapshot: "asc" }, { knowledgePointId: "asc" }],
                select: {
                  knowledgePointId: true,
                  codeSnapshot: true,
                  nameSnapshot: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!submission) throw new ResourceNotFoundError("提交结果不存在");
  if (submission.assignment.status === "REVOKED")
    throw new AssignmentRevokedError();
  // Ownership is established in the query. Leaving a class does not erase personal submitted history.
  // This read path does not grant access to current assignments or allow new work.
  if (submission.status === SubmissionStatus.IN_PROGRESS) {
    throw new AssignmentOperationError("作业尚未提交", 409);
  }
  const isPublished = submission.status === SubmissionStatus.PUBLISHED;
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    assignmentTitle: submission.assignment.title,
    attemptNumber: submission.attemptNumber,
    status: submission.status,
    submittedAt: submission.submittedAt,
    score: isPublished ? decimalNumber(submission.score) : null,
    maxScore: isPublished ? decimalNumber(submission.maxScore) : null,
    percentage: isPublished ? decimalNumber(submission.percentage) : null,
    isPublished,
    submittedAnswers: isPublished
      ? []
      : submission.answers.map((answer) => ({
          assignmentQuestionId: answer.assignmentQuestionId,
          title: answer.assignmentQuestion.titleSnapshot,
          content: answer.assignmentQuestion.contentSnapshot,
          images: answer.assignmentQuestion.examImages.map((image) => ({
            id: image.id,
            url: `/api/assignment-question-images/${image.id}`,
          })),
          type: answer.assignmentQuestion.typeSnapshot,
          sortOrder: answer.assignmentQuestion.sortOrder,
          studentAnswer: formatStudentAnswer(
            answer,
            answer.assignmentQuestion.typeSnapshot,
          ),
        })),
    attachments: submission.assignment.classroom.memberships.length
      ? submission.attachments
      : [],
    programmingAttempts: submission.answers.flatMap((answer) =>
      answer.programmingAttempts.flatMap((attempt) =>
        attempt.assignmentQuestionId
          ? [attempt as typeof attempt & { assignmentQuestionId: string }]
          : [],
      ),
    ),
    answers: isPublished
      ? submission.answers.map((answer) => ({
          id: answer.id,
          assignmentQuestionId: answer.assignmentQuestionId,
          title: answer.assignmentQuestion.titleSnapshot,
          content: answer.assignmentQuestion.contentSnapshot,
          images: answer.assignmentQuestion.examImages.map((image) => ({
            id: image.id,
            url: `/api/assignment-question-images/${image.id}`,
          })),
          type: answer.assignmentQuestion.typeSnapshot,
          sortOrder: answer.assignmentQuestion.sortOrder,
          score: decimalNumber(answer.score),
          maxScore: answer.maxScore.toNumber(),
          isCorrect: answer.isCorrect,
          gradingStatus: answer.gradingStatus,
          studentAnswer: formatStudentAnswer(
            answer,
            answer.assignmentQuestion.typeSnapshot,
          ),
          correctAnswer: formatCorrectAnswer(answer.assignmentQuestion),
          explanation: answer.assignmentQuestion.explanationSnapshot,
          teacherFeedback: answer.teacherFeedback,
          knowledgePoints:
            answer.assignmentQuestion.knowledgePointSnapshots.map(
              (knowledgePoint) => ({
                id: knowledgePoint.knowledgePointId,
                code: knowledgePoint.codeSnapshot,
                name: knowledgePoint.nameSnapshot,
              }),
            ),
        }))
      : [],
  };
}

/** Each classroom gets a separate frozen assignment; identical retried requests reuse the same IDs. */
export async function createAssignmentBatch(
  teacherId: string,
  raw: AssignmentBatchData,
) {
  const input = assignmentBatchSchema.parse(raw);
  const classroomIds = [...input.classroomIds].sort();
  if (
    classroomIds.length * Math.max(1, input.assignment.questions.length) >
    400
  )
    throw new AssignmentOperationError(
      "单次最多复制400题次，请减少班级或题目后分批发布",
      400,
    );
  const signature = createHash("sha256")
    .update(JSON.stringify({ teacherId, ...input, classroomIds }))
    .digest("hex");
  const ids = classroomIds.map(
    (id) =>
      "c" +
      createHash("sha256")
        .update(`${signature}:${id}`)
        .digest("hex")
        .slice(0, 24),
  );
  // 多班级一次保存：同批作业共享 batchId，之后可在草稿阶段一次编辑并一次发布。
  // 单班级不写该字段，保持原有单班行为完全不变。
  const batchId =
    classroomIds.length > 1
      ? "b" +
        createHash("sha256")
          .update(`batch:${signature}`)
          .digest("hex")
          .slice(0, 24)
      : null;
  return runAssignmentSerializable(
    async (tx) => {
      // Coordinate publication with class completion/closure in a stable lock order.
      await tx.$queryRaw`SELECT id FROM "Classroom" WHERE id IN (${Prisma.join(classroomIds)}) AND "teacherId" = ${teacherId} ORDER BY id FOR SHARE`;
      const classrooms = await tx.classroom.findMany({
        where: { id: { in: classroomIds }, teacherId },
        select: {
          id: true,
          name: true,
          status: true,
          courseId: true,
          course: { select: { teacherId: true, status: true } },
        },
      });
      if (classrooms.length !== classroomIds.length)
        throw new ResourceNotFoundError("班级不存在");
      const existing = await tx.assignment.findMany({
        where: { id: { in: ids }, teacherId },
        include: teacherAssignmentInclude,
      });
      if (existing.length === ids.length) {
        if (
          existing.some(
            (item) =>
              item.deletedAt ||
              item.status === AssignmentStatus.REVOKED ||
              (input.publish && item.status === AssignmentStatus.DRAFT),
          )
        )
          throw new AssignmentOperationError(
            "原批次中有作业已删除或取消预约，或已撤销，请重新发起操作",
            409,
          );
        return { assignments: existing.map(teacherView), reused: true };
      }
      if (existing.length)
        throw new AssignmentOperationError("批次状态异常，请刷新后重试", 409);
      const inactive = classrooms.filter((item) => item.status !== "ACTIVE");
      if (inactive.length)
        throw new AssignmentOperationError(
          `以下班级已结课、已关闭或已归档，不能保存或发布作业：${inactive.map((item) => item.name).join("、")}`,
          409,
        );
      if (
        classrooms.some(
          (item) =>
            item.courseId &&
            (item.course?.teacherId !== teacherId ||
              item.course.status === "ARCHIVED"),
        )
      )
        throw new ResourceNotFoundError("课程或班级不存在");
      if (
        classroomIds.length > 1 &&
        (new Set(classrooms.map((item) => item.courseId)).size !== 1 ||
          classrooms.some(
            (item) =>
              !item.courseId ||
              item.course?.teacherId !== teacherId ||
              item.course.status === "ARCHIVED",
          ))
      )
        throw new AssignmentOperationError(
          "批量发布仅支持本人同一课程下的有效班级",
          400,
        );
      for (let index = 0; index < classroomIds.length; index++) {
        await createDraftInTransaction(
          tx,
          teacherId,
          { ...input.assignment, classroomId: classroomIds[index] },
          ids[index],
          batchId,
        );
        if (input.publish)
          await publishInTransaction(tx, teacherId, ids[index]);
      }
      const saved = await tx.assignment.findMany({
        where: { id: { in: ids }, teacherId },
        include: teacherAssignmentInclude,
      });
      return { assignments: saved.map(teacherView), reused: false };
    },
    "多班作业正在保存，请使用原请求重试",
    30000,
  );
}
