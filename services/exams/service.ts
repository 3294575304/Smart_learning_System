import "server-only";
import { createHash } from "node:crypto";
import {
  AuditAction,
  AuditTargetType,
  ExamType,
  Prisma,
  QuestionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AssignmentOperationError } from "@/services/assignments/errors";
import {
  createDraftInTransaction,
  publishInTransaction,
  submitStudentAssignment,
} from "@/services/assignments/service";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeTeachingAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import {
  examQuestionHash,
  overlapsThreeYears,
  plusThreeYears,
} from "./fingerprint";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";
import { teacherExamListSchema, type ExamCreateInput } from "./schemas";

async function ownedCourse(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId, status: { not: "ARCHIVED" } },
    select: {
      id: true,
      questionCategoryId: true,
      currentPublishedSyllabusStructureId: true,
      currentPublishedSyllabusStructure: { select: { structureJson: true } },
      questionCategory: { select: { isActive: true } },
    },
  });
  if (!course?.questionCategoryId || !course.questionCategory.isActive)
    throw new ResourceNotFoundError("课程不存在或未设置题库分类");
  return {
    id: course.id,
    categoryId: course.questionCategoryId,
    syllabusStructureId: course.currentPublishedSyllabusStructureId,
    syllabusStructure: course.currentPublishedSyllabusStructure?.structureJson,
  };
}

export async function listExamCourseObjectives(teacherId: string) {
  const courses = await prisma.course.findMany({
    where: {
      teacherId,
      status: { not: "ARCHIVED" },
      currentPublishedSyllabusStructureId: { not: null },
    },
    select: {
      id: true,
      currentPublishedSyllabusStructure: { select: { structureJson: true } },
    },
  });
  return courses.map((course) => {
    const parsed = storedPublishableSyllabusStructureSchema.safeParse(
      course.currentPublishedSyllabusStructure?.structureJson,
    );
    return {
      courseId: course.id,
      objectives: parsed.success
        ? parsed.data.objectives.map(({ code, title }) => ({ code, title }))
        : [],
    };
  });
}

async function recentUses(
  tx: Prisma.TransactionClient | typeof prisma,
  categoryId: string,
  startsAt: Date,
) {
  const lower = new Date(startsAt);
  lower.setUTCFullYear(lower.getUTCFullYear() - 3);
  return tx.examQuestionUse.findMany({
    where: {
      questionCategoryId: categoryId,
      startsAt: { gte: lower, lte: plusThreeYears(startsAt) },
      examSession: { cancelledAt: null },
    },
    select: { questionId: true, contentHash: true, startsAt: true },
  });
}

export async function listEligibleExamQuestions(
  teacherId: string,
  input: {
    courseId: string;
    startsAt: Date;
    questionType?: string;
    objectiveCode?: string;
    conceptId?: string;
  },
) {
  const course = await ownedCourse(teacherId, input.courseId);
  const syllabusStructureId = course.syllabusStructureId;
  if (input.objectiveCode) {
    const syllabus = storedPublishableSyllabusStructureSchema.safeParse(
      course.syllabusStructure,
    );
    if (
      !syllabusStructureId ||
      !syllabus.success ||
      !syllabus.data.objectives.some(({ code }) => code === input.objectiveCode)
    )
      throw new ResourceNotFoundError("课程目标不存在");
  }
  const [questions, uses] = await Promise.all([
    prisma.question.findMany({
      where: {
        questionCategoryId: course.categoryId,
        status: QuestionStatus.ACTIVE,
        deletedAt: null,
        isAssignmentOnly: false,
        ...(input.questionType
          ? { type: input.questionType as "SINGLE_CHOICE" }
          : {}),
        ...(input.objectiveCode
          ? {
              courseObjectiveMappings: {
                some: {
                  courseId: input.courseId,
                  syllabusStructureId: syllabusStructureId ?? undefined,
                  objectiveCode: input.objectiveCode,
                },
              },
            }
          : {}),
        ...(input.conceptId
          ? {
              graphBindings: {
                some: { courseId: input.courseId, conceptId: input.conceptId },
              },
            }
          : {}),
      },
      include: {
        options: true,
        examImages: true,
        courseObjectiveMappings: {
          where: {
            courseId: input.courseId,
            syllabusStructureId: course.syllabusStructureId ?? undefined,
          },
          select: { objectiveCode: true },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    }),
    recentUses(prisma, course.categoryId, input.startsAt),
  ]);
  return questions.map((question) => {
    const hash = examQuestionHash(question);
    const blocked = uses.some(
      (use) =>
        overlapsThreeYears(input.startsAt, use.startsAt) &&
        (use.questionId === question.id || use.contentHash === hash),
    );
    return {
      id: question.id,
      title: question.title,
      type: question.type,
      objectiveCode: question.courseObjectiveMappings[0]?.objectiveCode ?? null,
      blocked,
    };
  });
}

export async function createExamSessionInTransaction(
  tx: Prisma.TransactionClient,
  teacherId: string,
  input: ExamCreateInput,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  const course = await ownedCourse(teacherId, input.courseId);
  const requestFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        teacherId,
        ...input,
        classroomIds: [...input.classroomIds].sort(),
      }),
    )
    .digest("hex");
  if (input.endsAt <= new Date())
    throw new AssignmentOperationError("考试截止时间必须晚于当前时间", 400);
  if (input.classroomIds.length * input.questions.length > 400)
    throw new AssignmentOperationError("单次最多复制400题次", 400);
  const existing = await tx.examSession.findUnique({
    where: { requestId: input.requestId },
    include: { assignments: true },
  });
  if (existing) {
    if (existing.teacherId !== teacherId)
      throw new ResourceNotFoundError("考试不存在");
    if (existing.requestFingerprint !== requestFingerprint)
      throw new AssignmentOperationError("请求键已用于其他考试内容", 409);
    return existing;
  }
  const currentCourse = await tx.course.findFirst({
    where: {
      id: course.id,
      teacherId,
      questionCategoryId: course.categoryId,
      status: { not: "ARCHIVED" },
    },
    select: { currentPublishedSyllabusStructureId: true },
  });
  if (
    !currentCourse ||
    currentCourse.currentPublishedSyllabusStructureId !==
      course.syllabusStructureId
  )
    throw new AssignmentOperationError("课程大纲版本已变化，请刷新后重试", 409);
  await tx.$queryRaw`SELECT id FROM "QuestionCourseCategory" WHERE id = ${course.categoryId} FOR UPDATE`;
  const classrooms = await tx.classroom.findMany({
    where: {
      id: { in: input.classroomIds },
      teacherId,
      courseId: course.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (classrooms.length !== input.classroomIds.length)
    throw new ResourceNotFoundError("班级不存在");
  const questions = await tx.question.findMany({
    where: {
      id: { in: input.questions.map((item) => item.questionId) },
      questionCategoryId: course.categoryId,
      status: QuestionStatus.ACTIVE,
      deletedAt: null,
      isAssignmentOnly: false,
    },
    include: {
      options: true,
      examImages: true,
      courseObjectiveMappings: {
        where: {
          courseId: course.id,
          syllabusStructureId: course.syllabusStructureId ?? undefined,
        },
        select: { objectiveCode: true },
        take: 1,
      },
    },
  });
  if (questions.length !== input.questions.length)
    throw new AssignmentOperationError("部分题目不可用于本课程考试", 400);
  const uses = await recentUses(tx, course.categoryId, input.startsAt);
  const selectedHashes = new Set<string>();
  for (const question of questions) {
    const hash = examQuestionHash(question);
    if (selectedHashes.has(hash))
      throw new AssignmentOperationError("同一试卷不能包含内容相同的题目", 400);
    selectedHashes.add(hash);
    if (
      uses.some(
        (use) =>
          overlapsThreeYears(input.startsAt, use.startsAt) &&
          (use.questionId === question.id || use.contentHash === hash),
      )
    )
      throw new AssignmentOperationError(
        `题目「${question.title}」近三年已用于考试`,
        409,
      );
  }
  const session = await tx.examSession.create({
    data: {
      requestId: input.requestId,
      requestFingerprint,
      teacherId,
      courseId: course.id,
      questionCategoryId: course.categoryId,
      type: input.type,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      allowedSwitches: input.allowedSwitches,
      questionUses: {
        create: questions.map((question) => ({
          questionId: question.id,
          questionCategoryId: course.categoryId,
          contentHash: examQuestionHash(question),
          startsAt: input.startsAt,
          objectiveCode: course.syllabusStructureId
            ? (question.courseObjectiveMappings[0]?.objectiveCode ?? null)
            : question.defaultObjectiveKind,
          syllabusStructureId: course.syllabusStructureId,
        })),
      },
    },
  });
  for (const classroomId of [...input.classroomIds].sort()) {
    const assignmentId = await createDraftInTransaction(tx, teacherId, {
      title: input.title,
      description: input.type === ExamType.MIDTERM ? "期中考试" : "期末考试",
      classroomId,
      publishedAt: input.startsAt,
      dueAt: input.endsAt,
      allowResubmission: false,
      allowAttachments: false,
      questions: input.questions.map((item, index) => ({
        ...item,
        sortOrder: index + 1,
      })),
    });
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { examSessionId: session.id },
    });
    await publishInTransaction(tx, teacherId, assignmentId);
    const snapshots = await tx.assignmentQuestion.findMany({
      where: { assignmentId },
      select: { id: true, questionId: true },
    });
    const snapshotByQuestion = new Map(
      snapshots.map((item) => [item.questionId, item.id]),
    );
    const imageRows = questions.flatMap((question) =>
      question.examImages.map((image) => ({
        assignmentQuestionId: snapshotByQuestion.get(question.id) ?? "",
        sortOrder: image.sortOrder,
        storageKey: image.storageKey,
        checksum: image.checksum,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
      })),
    );
    if (imageRows.some((row) => !row.assignmentQuestionId))
      throw new AssignmentOperationError("试卷图片快照创建失败", 409);
    if (imageRows.length)
      await tx.assignmentQuestionImage.createMany({ data: imageRows });
  }
  await writeTeachingAuditLog(tx, {
    actorId: teacherId,
    action: AuditAction.EXAM_PUBLISHED,
    targetType: AuditTargetType.EXAM_SESSION,
    targetId: session.id,
    summary: "发布考试",
    beforeData: null,
    afterData: {
      courseId: course.id,
      classroomIds: [...input.classroomIds].sort(),
      type: input.type,
      startsAt: input.startsAt.toISOString(),
      endsAt: input.endsAt.toISOString(),
      questionCount: input.questions.length,
    },
    context,
  });
  return tx.examSession.findUniqueOrThrow({
    where: { id: session.id },
    include: { assignments: true },
  });
}

export async function createExamSession(
  teacherId: string,
  input: ExamCreateInput,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  return runAssignmentSerializable(
    (tx) => createExamSessionInTransaction(tx, teacherId, input, context),
    "考试发布发生并发冲突，请刷新后重试",
    30000,
  );
}

export async function listTeacherExams(
  teacherId: string,
  scope: { courseId?: string; classroomId?: string } = {},
) {
  const { courseId, classroomId } = teacherExamListSchema.parse(scope);
  if (
    courseId &&
    !(await prisma.course.findFirst({
      where: { id: courseId, teacherId },
      select: { id: true },
    }))
  )
    throw new ResourceNotFoundError("课程不存在");
  if (
    classroomId &&
    !(await prisma.classroom.findFirst({
      where: { id: classroomId, teacherId, ...(courseId ? { courseId } : {}) },
      select: { id: true },
    }))
  )
    throw new ResourceNotFoundError("班级不存在");
  return prisma.examSession.findMany({
    where: {
      teacherId,
      ...(courseId ? { courseId } : {}),
      ...(classroomId ? { assignments: { some: { classroomId } } } : {}),
    },
    include: {
      assignments: {
        ...(classroomId ? { where: { classroomId } } : {}),
        select: { id: true, classroom: { select: { name: true } } },
      },
    },
    orderBy: { startsAt: "desc" },
  });
}

export async function getTeacherExamMonitor(teacherId: string, examId: string) {
  const exam = await prisma.examSession.findFirst({
    where: { id: examId, teacherId },
    include: {
      assignments: {
        include: {
          classroom: {
            select: {
              name: true,
              _count: {
                select: { memberships: { where: { status: "ACTIVE" } } },
              },
            },
          },
          submissions: {
            select: {
              id: true,
              status: true,
              submittedAt: true,
              student: {
                select: {
                  profile: { select: { displayName: true, studentNo: true } },
                },
              },
            },
          },
        },
      },
      switchEvents: { select: { submissionId: true } },
    },
  });
  if (!exam) throw new ResourceNotFoundError("考试不存在");
  const switchCounts = new Map<string, number>();
  exam.switchEvents.forEach((event) =>
    switchCounts.set(
      event.submissionId,
      (switchCounts.get(event.submissionId) ?? 0) + 1,
    ),
  );
  return {
    ...exam,
    assignments: exam.assignments.map((assignment) => ({
      id: assignment.id,
      classroomName: assignment.classroom.name,
      expectedCount: assignment.classroom._count.memberships,
      submissions: assignment.submissions.map((submission) => ({
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
        studentName: submission.student.profile?.displayName ?? "未命名学生",
        studentNo: submission.student.profile?.studentNo ?? "",
        switchCount: switchCounts.get(submission.id) ?? 0,
      })),
    })),
  };
}

export async function cancelExamSession(
  teacherId: string,
  examId: string,
  context: AuditRequestContext = { ipAddress: null, userAgent: null },
) {
  return runAssignmentSerializable(async (tx) => {
    const exam = await tx.examSession.findFirst({
      where: { id: examId, teacherId },
      select: { id: true, startsAt: true, cancelledAt: true },
    });
    if (!exam) throw new ResourceNotFoundError("考试不存在");
    if (exam.cancelledAt) return exam;
    if (exam.startsAt <= new Date())
      throw new AssignmentOperationError("开考后不能取消考试", 409);
    await tx.examSession.update({
      where: { id: examId },
      data: { cancelledAt: new Date() },
    });
    await tx.assignment.updateMany({
      where: { examSessionId: examId },
      data: { status: "CLOSED", closedAt: new Date() },
    });
    await writeTeachingAuditLog(tx, {
      actorId: teacherId,
      action: AuditAction.EXAM_CANCELLED,
      targetType: AuditTargetType.EXAM_SESSION,
      targetId: examId,
      summary: "开考前取消考试",
      beforeData: { startsAt: exam.startsAt.toISOString() },
      afterData: { cancelledAt: new Date().toISOString() },
      context,
    });
    return { ...exam, cancelledAt: new Date() };
  }, "考试状态已变化，请刷新后重试");
}

export async function listStudentExams(studentId: string) {
  return prisma.examSession.findMany({
    where: {
      cancelledAt: null,
      assignments: {
        some: {
          classroom: { memberships: { some: { studentId, status: "ACTIVE" } } },
        },
      },
    },
    include: {
      assignments: {
        where: {
          deletedAt: null,
          status: { in: ["PUBLISHED", "CLOSED"] },
          classroom: { memberships: { some: { studentId, status: "ACTIVE" } } },
        },
        select: {
          id: true,
          status: true,
          classroomId: true,
          classroom: { select: { name: true, status: true, courseId: true } },
          submissions: {
            where: { studentId, status: { not: "WITHDRAWN" } },
            select: { status: true },
            orderBy: { attemptNumber: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { startsAt: "desc" },
  });
}

export async function recordExamSwitch(
  studentId: string,
  submissionId: string,
  eventKey: string,
) {
  const result = await runAssignmentSerializable(async (tx) => {
    const submission = await tx.submission.findFirst({
      where: {
        id: submissionId,
        studentId,
        status: "IN_PROGRESS",
        assignment: { examSessionId: { not: null } },
      },
      select: { assignment: { select: { examSession: true } } },
    });
    const exam = submission?.assignment.examSession;
    if (!exam || exam.cancelledAt)
      throw new ResourceNotFoundError("考试作答不存在");
    const now = new Date();
    if (now < exam.startsAt || now >= exam.endsAt)
      throw new AssignmentOperationError("考试不在作答时间内", 409);
    const previous = await tx.examSwitchEvent.findUnique({
      where: { eventKey },
    });
    if (
      previous &&
      (previous.submissionId !== submissionId ||
        previous.examSessionId !== exam.id)
    )
      throw new AssignmentOperationError("切屏事件键冲突", 409);
    if (!previous)
      await tx.examSwitchEvent.create({
        data: { eventKey, submissionId, examSessionId: exam.id },
      });
    const count = await tx.examSwitchEvent.count({ where: { submissionId } });
    return {
      count,
      allowedSwitches: exam.allowedSwitches,
      shouldSubmit: count > exam.allowedSwitches,
    };
  }, "切屏记录发生并发冲突，请重试");
  if (result.shouldSubmit)
    await submitStudentAssignment(studentId, submissionId, "EXAM_AUTO");
  return result;
}
