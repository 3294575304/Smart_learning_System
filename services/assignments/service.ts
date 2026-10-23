import { assertClassroomWorkAllowed } from "./classroom-work";
import { assignmentSectionWhere } from "@/services/assignments/presentation";
import "server-only";
import { assignmentStatusWhere } from "./presentation";
import { createHash } from "node:crypto";
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
import { AssignmentOperationError } from "@/services/assignments/errors";
import { gradeAnswer, savedAnswerInput } from "@/services/assignments/grading";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
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
import { freezeAssignmentQuestionConcepts } from "@/services/concept-mastery/assignment-snapshot";
import { freezeAssignmentProgrammingConfigs } from "@/services/programming-questions/assignment-snapshot";
import { createFormalProgrammingAttempt } from "@/services/programming-attempts/service";
import { appendAssessmentLearningEventsAndProjectEvidence } from "@/services/learning-events/assessment";
import { notifyAssignmentPublished } from "@/services/notifications/events/assignment";
import { getStudentCourseContext } from "@/services/courses/student-access";

const teacherAssignmentInclude = {
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

async function assertAssignmentResources(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  input: AssignmentUpsertData,
  assignmentId?: string,
) {
  const classroom = await transaction.classroom.findUnique({
    where: { id: input.classroomId },
    select: { teacherId: true, status: true, courseId: true },
  });
  assertTeacherOwnsClassroom(teacherId, classroom);
  await validateAssignmentResourceFiles(
    transaction,
    teacherId,
    classroom?.courseId ?? null,
    input.submissionTask?.resourceFileIds ?? [],
  );

  const questionIds = input.questions.map((item) => item.questionId);
  const questions = await transaction.question.findMany({
    where: {
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
      difficulty: 1,
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
          difficultySnapshot: 1,
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
  const [classrooms, questions, courses] = await Promise.all([
    prisma.classroom.findMany({
      where: { teacherId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, courseId: true },
    }),
    prisma.question.findMany({
      where: {
        status: QuestionStatus.ACTIVE,
        isAssignmentOnly: false,
        deletedAt: null,
        OR: [
          { creatorId: teacherId },
          { visibility: QuestionVisibility.PUBLIC },
        ],
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        difficulty: true,
        visibility: true,
        creatorId: true,
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
    classrooms,
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
      isOwned: question.creatorId === teacherId,
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
          AND: [assignmentSectionWhere(query.section)],
          status: { in: ["CLOSED", "ARCHIVED"] },
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
          AND: [assignmentSectionWhere(query.section)],
          ...(query.courseId
            ? { classroom: { courseId: query.courseId, teacherId } }
            : {}),
        },
      }),
    ]);
  return {
    items: assignments.map(teacherView),
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
    where: { id: assignmentId, teacherId },
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

async function createDraftInTransaction(
  transaction: Prisma.TransactionClient,
  teacherId: string,
  input: AssignmentUpsertData,
  fixedId?: string,
): Promise<string> {
  await assertAssignmentResources(transaction, teacherId, input);
  const assignment = await transaction.assignment.create({
    data: {
      ...(fixedId ? { id: fixedId } : {}),
      classroomId: input.classroomId,
      teacherId,
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
        allowAttachments: input.allowAttachments ?? false,
        submissionTask: input.submissionTask ?? Prisma.DbNull,
        publishedAt: input.publishedAt,
        dueAt: input.dueAt,
        totalPoints,
      },
    });
  });
  return getTeacherAssignment(teacherId, assignmentId);
}

async function publishInTransaction(
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
  if (!assignment || assignment.teacherId !== teacherId) {
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
  await runAssignmentSerializable(
    (transaction) => publishInTransaction(transaction, teacherId, assignmentId),
    "作业发布状态已发生变化，请刷新后重试",
  );
  return getTeacherAssignment(teacherId, assignmentId);
}

export async function listStudentAssignments(
  studentId: string,
  courseId?: string,
  classroomId?: string,
): Promise<StudentAssignmentListItem[]> {
  if (courseId) await getStudentCourseContext(studentId, courseId);
  const now = new Date();
  const assignments = await prisma.assignment.findMany({
    where: {
      status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
      publishedAt: { lte: now },
      ...(courseId ? { classroom: { courseId } } : {}),
      ...(classroomId ? { classroomId } : {}),
      OR: [
        {
          status: AssignmentStatus.PUBLISHED,
          classroom: {
            status: "ACTIVE",
            memberships: {
              some: { studentId, status: MembershipStatus.ACTIVE },
            },
          },
        },
        {
          submissions: {
            some: {
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
          },
        },
      ],
    },
    include: {
      classroom: {
        select: {
          status: true,
          name: true,
          memberships: { where: { studentId }, select: { status: true } },
        },
      },
      _count: { select: { questions: true } },
      submissions: {
        where: { studentId, status: { not: SubmissionStatus.WITHDRAWN } },
        orderBy: { attemptNumber: "desc" },
        select: { id: true, status: true, attemptNumber: true, score: true },
      },
    },
    orderBy: [{ dueAt: "asc" }, { publishedAt: "desc" }],
  });
  return assignments.flatMap((assignment) => {
    if (!assignment.publishedAt || !assignment.dueAt) return [];
    const historyOnly =
      assignment.status === AssignmentStatus.CLOSED ||
      assignment.classroom.status !== "ACTIVE" ||
      assignment.classroom.memberships[0]?.status !== MembershipStatus.ACTIVE;
    const inProgress = historyOnly
      ? undefined
      : assignment.submissions.find(
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
        questionCount: assignment._count.questions,
        publishedAt: assignment.publishedAt,
        dueAt: assignment.dueAt,
        allowResubmission: assignment.allowResubmission,
        attemptCount: assignment.submissions.filter(
          (submission) => submission.status !== SubmissionStatus.IN_PROGRESS,
        ).length,
        inProgressSubmissionId: inProgress?.id ?? null,
        latestSubmissionId: latest?.id ?? null,
        historyOnly,
        latestSubmissionStatus: latest?.status ?? null,
        latestPublishedScore:
          latest?.status === SubmissionStatus.PUBLISHED
            ? decimalNumber(latest.score)
            : null,
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
      assertAssignmentAcceptsWork(assignment, new Date());
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
  if (submission.assignment.classroom.status !== "ACTIVE")
    throw new AssignmentOperationError(
      "班级已结课或已关闭，请返回作业页面查看历史提交与成绩",
    );
  assertAssignmentIsVisible(submission.assignment, new Date());
  return {
    id: submission.id,
    assignmentId: submission.assignmentId,
    assignmentTitle: submission.assignment.title,
    allowAttachments: submission.assignment.allowAttachments,
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
    assertAssignmentAcceptsWork(submission.assignment, now);
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
    assertActiveMembership(membership ?? null);
    const now = new Date();
    assertAssignmentAcceptsWork(submission.assignment, now);
    await assertClassroomWorkAllowed(
      transaction,
      submission.assignment.classroomId,
    );
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
      assignment: { select: { title: true } },
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
  return runAssignmentSerializable(
    async (tx) => {
      const classrooms = await tx.classroom.findMany({
        where: { id: { in: classroomIds }, teacherId, status: "ACTIVE" },
        select: {
          id: true,
          courseId: true,
          course: { select: { teacherId: true, status: true } },
        },
      });
      if (classrooms.length !== classroomIds.length)
        throw new ResourceNotFoundError("班级不存在");
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
      const existing = await tx.assignment.findMany({
        where: { id: { in: ids }, teacherId },
        include: teacherAssignmentInclude,
      });
      if (existing.length === ids.length)
        return { assignments: existing.map(teacherView), reused: true };
      if (existing.length)
        throw new AssignmentOperationError("批次状态异常，请刷新后重试", 409);
      for (let index = 0; index < classroomIds.length; index++) {
        await createDraftInTransaction(
          tx,
          teacherId,
          { ...input.assignment, classroomId: classroomIds[index] },
          ids[index],
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
