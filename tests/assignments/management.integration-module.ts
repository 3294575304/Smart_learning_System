import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createAssignmentBatch,
  updateDraftAssignment,
  getTeacherAssignment,
  listTeacherAssignments,
  publishAssignment,
} from "@/services/assignments/service";
import {
  assignmentBatchSchema,
  assignmentUpsertSchema,
  assignmentListQuerySchema,
} from "@/services/assignments/schemas";
import {
  uploadAssignmentResource,
  readAssignmentResource,
  listAssignmentResourceFiles,
} from "@/services/assignments/resources";
import {
  getAssignmentPublicationState,
  publishAssignmentResults,
} from "@/services/assignments/manual-grading";
import { getTeacherDashboard } from "@/services/dashboard/teacher-dashboard";
import { getTeacherAssignmentOverview } from "@/services/assignments/teacher-overview";

export async function verifyAssignmentManagement(ids: {
  teacherId: string;
  otherTeacherId: string;
  studentId: string;
  courseId: string;
  class1Id: string;
  class2Id: string;
  otherClassId: string;
}) {
  const context = { ipAddress: null, userAgent: "assignment-management-test" };
  const file = await uploadAssignmentResource(
    ids.teacherId,
    ids.courseId,
    new File(["教师实验说明"], "实验说明.txt", { type: "text/plain" }),
    context,
  );
  await assert.rejects(
    uploadAssignmentResource(
      ids.otherTeacherId,
      ids.courseId,
      new File(["x"], "x.txt", { type: "text/plain" }),
      context,
    ),
  );
  await assert.rejects(
    uploadAssignmentResource(
      ids.teacherId,
      ids.courseId,
      new File(["fake pdf"], "x.pdf", { type: "application/pdf" }),
      context,
    ),
  );
  const assignment = assignmentUpsertSchema.parse({
    title: "多班实验任务",
    classroomId: ids.class1Id,
    publishedAt: new Date(Date.now() - 1000),
    dueAt: new Date(Date.now() + 86400000),
    allowAttachments: true,
    allowResubmission: true,
    questions: [],
    submissionTask: {
      prompt: "阅读附件并提交实验报告",
      referenceAnswer: "仅教师可见的评分参考",
      points: 100,
      resourceFileIds: [file.id],
    },
  });
  const input = assignmentBatchSchema.parse({
    requestId: randomUUID(),
    classroomIds: [ids.class1Id, ids.class2Id],
    publish: true,
    assignment,
  });
  const beforeCount = await prisma.assignment.count();
  const [first, second] = await Promise.all([
    createAssignmentBatch(ids.teacherId, input),
    createAssignmentBatch(ids.teacherId, input),
  ]);
  assert.deepEqual(
    new Set(first.assignments.map((item) => item.id)),
    new Set(second.assignments.map((item) => item.id)),
  );
  assert.equal(await prisma.assignment.count(), beforeCount + 2);
  assert.equal(first.assignments.length, 2);
  assert.ok(
    first.assignments.every(
      (item) =>
        item.status === "PUBLISHED" &&
        item.questions.length === 1 &&
        item.totalPoints === 100,
    ),
  );
  assert.notEqual(
    first.assignments[0].questions[0].questionId,
    first.assignments[1].questions[0].questionId,
  );
  const own = first.assignments.find(
    (item) => item.classroom.id === ids.class1Id,
  );
  const foreignClass = first.assignments.find(
    (item) => item.classroom.id === ids.class2Id,
  );
  assert.ok(own);
  assert.ok(foreignClass);
  await assert.rejects(
    createAssignmentBatch(ids.teacherId, {
      ...input,
      requestId: randomUUID(),
      assignment: {
        ...assignment,
        submissionTask: undefined,
        questions: [
          {
            questionId: own.questions[0].questionId,
            sortOrder: 1,
            points: 100,
          },
        ],
      },
    }),
    "a private task source cannot be reused as a shared bank question",
  );
  const ongoing = await listTeacherAssignments(
    ids.teacherId,
    assignmentListQuerySchema.parse({
      courseId: ids.courseId,
      status: "IN_PROGRESS",
      pageSize: 50,
    }),
  );
  assert.ok(ongoing.items.some((item) => item.id === own.id));
  for (const status of ["UPCOMING", "EXPIRED"] as const) {
    const filtered = await listTeacherAssignments(
      ids.teacherId,
      assignmentListQuerySchema.parse({
        courseId: ids.courseId,
        status,
        pageSize: 50,
      }),
    );
    assert.ok(!filtered.items.some((item) => item.id === own.id));
  }
  const overview = await getTeacherAssignmentOverview(ids.teacherId, own.id);
  assert.equal(
    overview.assignment.submissionTask?.prompt,
    "阅读附件并提交实验报告",
  );
  assert.equal(overview.assignment.resourceFiles?.[0].id, file.id);
  assert.equal(overview.questions.length, 1);
  assert.equal(overview.questions[0].content, "阅读附件并提交实验报告");
  await prisma.question.update({
    where: { id: own.questions[0].questionId },
    data: { content: "题库后续修改不应覆盖发布快照" },
  });
  assert.equal(
    (await getTeacherAssignmentOverview(ids.teacherId, own.id)).questions[0]
      .content,
    overview.questions[0].content,
  );
  await assert.rejects(
    getTeacherAssignmentOverview(ids.otherTeacherId, own.id),
  );
  await assert.rejects(
    getTeacherAssignmentOverview(ids.teacherId, "cm00000000000000000000001"),
  );
  const student = { id: ids.studentId, role: "STUDENT" as const };
  assert.equal((await listAssignmentResourceFiles(student, own.id)).length, 1);
  assert.equal(
    (
      await readAssignmentResource(student, own.id, file.id, context)
    ).data.toString(),
    "教师实验说明",
  );
  await assert.rejects(
    readAssignmentResource(student, foreignClass.id, file.id, context),
  );
  await assert.rejects(
    readAssignmentResource(
      { id: ids.otherTeacherId, role: "TEACHER" },
      own.id,
      file.id,
      context,
    ),
  );
  await assert.rejects(
    readAssignmentResource(
      { id: ids.teacherId, role: "ADMIN" },
      own.id,
      file.id,
      context,
    ),
  );
  await assert.rejects(
    updateDraftAssignment(ids.teacherId, own.id, assignment),
  );
  const baseline = await prisma.assignment.count();
  await assert.rejects(
    createAssignmentBatch(ids.teacherId, {
      ...input,
      requestId: randomUUID(),
      classroomIds: [ids.class1Id, ids.otherClassId],
    }),
  );
  await assert.rejects(createAssignmentBatch(ids.otherTeacherId, input));
  await assert.rejects(
    createAssignmentBatch(ids.teacherId, {
      ...input,
      requestId: randomUUID(),
      assignment: {
        ...assignment,
        publishedAt: new Date(Date.now() - 20000),
        dueAt: new Date(Date.now() - 10000),
      },
    }),
  );
  assert.equal(
    await prisma.assignment.count(),
    baseline,
    "failed batches must not leave partial drafts",
  );
  const draft = await createAssignmentBatch(ids.teacherId, {
    ...input,
    requestId: randomUUID(),
    classroomIds: [ids.class1Id],
    publish: false,
  });
  assert.equal(
    (await getTeacherAssignment(ids.teacherId, draft.assignments[0].id))
      .resourceFiles?.length,
    1,
  );
  await assert.rejects(
    listAssignmentResourceFiles(student, draft.assignments[0].id),
  );

  const startedAt = new Date(Date.now() - 3000);
  const submittedAt = new Date(Date.now() - 2000);
  const old = await prisma.submission.create({
    data: {
      assignmentId: own.id,
      studentId: ids.studentId,
      attemptNumber: 1,
      idempotencyKey: randomUUID(),
      status: "PENDING_REVIEW",
      startedAt,
      submittedAt,
      answers: {
        create: {
          assignmentQuestionId: own.questions[0].id,
          maxScore: 100,
          gradingStatus: "MANUAL_REVIEW_REQUIRED",
        },
      },
    },
  });
  const latest = await prisma.submission.create({
    data: {
      assignmentId: own.id,
      studentId: ids.studentId,
      attemptNumber: 2,
      idempotencyKey: randomUUID(),
      status: "GRADED",
      startedAt,
      submittedAt,
      gradedAt: new Date(),
      score: 80,
      maxScore: 100,
      percentage: 80,
      answers: {
        create: {
          assignmentQuestionId: own.questions[0].id,
          maxScore: 100,
          score: 80,
          isCorrect: false,
          gradingStatus: "GRADED",
          gradedAt: new Date(),
          graderId: ids.teacherId,
        },
      },
    },
  });
  await prisma.assignment.update({
    where: { id: own.id },
    data: { dueAt: new Date(Date.now() - 1000) },
  });
  assert.deepEqual(await getAssignmentPublicationState(ids.teacherId, own.id), {
    blockedReason: null,
    pendingCount: 0,
    gradedCount: 1,
    publishedCount: 0,
    canPublish: true,
  });
  const todo = (
    await getTeacherDashboard(ids.teacherId, { courseId: ids.courseId })
  ).workspace?.todo;
  assert.ok(todo?.some((item) => item.key === `publish:${own.id}`));
  assert.ok(!todo?.some((item) => item.key === `grade:${own.id}`));
  assert.equal(
    (await publishAssignmentResults(ids.teacherId, own.id, context))
      .publishedCount,
    1,
  );
  assert.equal(
    (await prisma.submission.findUniqueOrThrow({ where: { id: old.id } }))
      .status,
    "PENDING_REVIEW",
  );
  assert.equal(
    (await prisma.submission.findUniqueOrThrow({ where: { id: latest.id } }))
      .status,
    "PUBLISHED",
  );
  assert.ok(
    !(
      await getTeacherDashboard(ids.teacherId, { courseId: ids.courseId })
    ).workspace?.todo.some(
      (item) =>
        item.key === `publish:${own.id}` || item.key === `grade:${own.id}`,
    ),
  );
  assert.equal(
    (await publishAssignmentResults(ids.teacherId, own.id, context))
      .publishedCount,
    0,
  );
  await prisma.submission.create({
    data: {
      assignmentId: own.id,
      studentId: ids.studentId,
      attemptNumber: 3,
      idempotencyKey: randomUUID(),
      status: "PENDING_REVIEW",
      startedAt,
      submittedAt,
    },
  });
  assert.equal(
    (await getAssignmentPublicationState(ids.teacherId, own.id)).canPublish,
    false,
  );
  await assert.rejects(
    publishAssignmentResults(ids.teacherId, own.id, context),
  );
  console.log(
    "Assignment management passed: atomic multi-class retries, snapshots, private teacher files, ownership, latest-attempt publication and todo removal.",
  );
  await prisma.assignment.update({
    where: { id: foreignClass.id },
    data: { status: "ARCHIVED" },
  });
  const classOneHistory = await listTeacherAssignments(
    ids.teacherId,
    assignmentListQuerySchema.parse({
      courseId: ids.courseId,
      classroomId: ids.class1Id,
    }),
  );
  assert.ok(!classOneHistory.availableHistoryStatuses.includes("ARCHIVED"));
  const classTwoHistory = await listTeacherAssignments(
    ids.teacherId,
    assignmentListQuerySchema.parse({
      section: "HISTORY",
      courseId: ids.courseId,
      classroomId: ids.class2Id,
    }),
  );
  assert.ok(classTwoHistory.availableHistoryStatuses.includes("ARCHIVED"));
  assert.ok(classTwoHistory.availableClassroomIds.includes(ids.class2Id));
  assert.ok(!classTwoHistory.availableClassroomIds.includes(ids.class1Id));
  assert.ok(classTwoHistory.items.some((item) => item.id === foreignClass.id));
  const archiveResults = await listTeacherAssignments(
    ids.teacherId,
    assignmentListQuerySchema.parse({
      courseId: ids.courseId,
      classroomId: ids.class2Id,
      status: "ARCHIVED",
    }),
  );
  assert.ok(archiveResults.items.some((item) => item.id === foreignClass.id));
  console.log(
    "History status options passed: class-scoped availability, archived records hidden by default and recoverable through explicit filters.",
  );
  const category = await prisma.course.findUniqueOrThrow({
    where: { id: ids.courseId },
    select: { questionCategoryId: true },
  });
  const bank = await Promise.all(
    ["甲", "乙"].map((label) =>
      prisma.question.create({
        data: {
          creatorId: ids.teacherId,
          questionCategoryId: category.questionCategoryId,
          title: `分值恢复${label}`,
          content: "草稿恢复与冻结测试",
          explanation: "测试解析",
          type: "SHORT_ANSWER",
          difficulty: 1,
          referenceAnswer: "评分参考",
          status: "ACTIVE",
        },
      }),
    ),
  );
  const customInput = assignmentBatchSchema.parse({
    ...input,
    requestId: randomUUID(),
    publish: false,
    assignment: {
      ...assignment,
      submissionTask: undefined,
      allowAttachments: false,
      questions: [
        { questionId: bank[1].id, sortOrder: 1, points: 37.5 },
        { questionId: bank[0].id, sortOrder: 2, points: 42.5 },
      ],
    },
  });
  const custom = await createAssignmentBatch(ids.teacherId, customInput);
  assert.equal(custom.assignments.length, 2);
  for (const saved of custom.assignments) {
    const restored = await getTeacherAssignment(ids.teacherId, saved.id);
    assert.equal(restored.status, "DRAFT");
    assert.equal(restored.totalPoints, 80);
    assert.deepEqual(
      restored.questions.map((q) => [q.questionId, q.points]),
      [
        [bank[1].id, 37.5],
        [bank[0].id, 42.5],
      ],
    );
  }
  await publishAssignment(ids.teacherId, custom.assignments[0].id);
  assert.equal(
    (await getTeacherAssignment(ids.teacherId, custom.assignments[1].id))
      .status,
    "DRAFT",
  );
  await prisma.question.update({
    where: { id: bank[1].id },
    data: { content: "之后修改题库" },
  });
  assert.equal(
    (
      await getTeacherAssignmentOverview(
        ids.teacherId,
        custom.assignments[0].id,
      )
    ).questions[0].content,
    "草稿恢复与冻结测试",
  );
  const ended = await prisma.classroom.create({
    data: {
      teacherId: ids.teacherId,
      courseId: ids.courseId,
      name: "多班发布拒绝结课班",
      joinCode: randomUUID(),
      status: "COMPLETED",
    },
  });
  const baselineAfterDrafts = await prisma.assignment.count();
  await assert.rejects(
    createAssignmentBatch(ids.teacherId, {
      ...customInput,
      publish: true,
      requestId: randomUUID(),
      classroomIds: [ids.class1Id, ended.id],
    }),
    /已结课|已关闭/,
  );
  assert.equal(
    await prisma.assignment.count(),
    baselineAfterDrafts,
    "an ended class must reject the whole batch",
  );
  await prisma.classroom.update({
    where: { id: ended.id },
    data: { status: "ACTIVE" },
  });
  const retryInput = {
    ...customInput,
    assignment: { ...customInput.assignment, classroomId: ended.id },
    publish: true,
    requestId: randomUUID(),
    classroomIds: [ended.id],
  };
  const firstPublish = await createAssignmentBatch(ids.teacherId, retryInput);
  await prisma.classroom.update({
    where: { id: ended.id },
    data: { status: "COMPLETED" },
  });
  const reusedAfterCompletion = await createAssignmentBatch(
    ids.teacherId,
    retryInput,
  );
  assert.equal(reusedAfterCompletion.reused, true);
  assert.equal(
    reusedAfterCompletion.assignments[0].id,
    firstPublish.assignments[0].id,
  );
  console.log(
    "Editor phase two passed: multi-class custom draft restoration, preserved order/points, independent single-class publication, frozen content and ended-class atomic rejection.",
  );
}
