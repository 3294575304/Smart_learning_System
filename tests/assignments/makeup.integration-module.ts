import sharp from "sharp";
import { uploadSubmissionAttachment } from "@/services/assignments/attachments";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  createAssignmentBatch,
  startOrResumeAttempt,
  saveStudentAnswers,
  submitStudentAssignment,
  getStudentSubmissionDraft,
} from "@/services/assignments/service";
import {
  extendAssignmentDeadline,
  issueAssignmentMakeup,
  revokeAssignmentMakeup,
} from "@/services/assignments/makeup-service";
import {
  getAssignmentPublicationState,
  publishAssignmentResults,
} from "@/services/assignments/manual-grading";
import { readStudentWorkAccess } from "@/services/assignments/work-access";
import { runAssignmentDueReminders } from "@/services/notifications/reminders";
import { completeClassroom } from "@/services/classrooms/service";
import { getTeacherStudentAssignments } from "@/services/assignments/student-service";
import { teacherStudentDetailQuerySchema } from "@/services/assignments/student-query";

export async function verifyAssignmentMakeup(ids: {
  teacherId: string;
  otherTeacherId: string;
  studentId: string;
  lateStudentId: string;
  courseId: string;
}) {
  const context = { ipAddress: null, userAgent: "isolated-makeup-test" };
  const category = await prisma.course.findUniqueOrThrow({
    where: { id: ids.courseId },
    select: { questionCategoryId: true },
  });
  const classroom = await prisma.classroom.create({
    data: {
      teacherId: ids.teacherId,
      courseId: ids.courseId,
      name: "补交隔离验收班",
      joinCode: randomUUID(),
      memberships: {
        create: [
          { studentId: ids.studentId },
          { studentId: ids.lateStudentId },
        ],
      },
    },
  });
  const source = await prisma.question.create({
    data: {
      creatorId: ids.teacherId,
      questionCategoryId: category.questionCategoryId,
      title: "补交判定题",
      content: "Python列表可变",
      type: "TRUE_FALSE",
      correctBoolean: true,
      explanation: "判定说明",
      difficulty: 1,
      status: "ACTIVE",
    },
  });
  const input = {
    requestId: randomUUID(),
    publish: true,
    classroomIds: [classroom.id],
    assignment: {
      title: "补交闭环验收",
      description: "隔离数据",
      classroomId: classroom.id,
      publishedAt: new Date(Date.now() - 86400000),
      dueAt: new Date(Date.now() + 3600000),
      allowResubmission: false,
      questions: [{ questionId: source.id, sortOrder: 1, points: 20 }],
    },
  };
  const {
    assignments: [task],
  } = await createAssignmentBatch(ids.teacherId, input);
  const {
    assignments: [scheduled],
  } = await createAssignmentBatch(ids.teacherId, {
    ...input,
    requestId: randomUUID(),
    assignment: {
      ...input.assignment,
      title: "一小时后开放",
      publishedAt: new Date(Date.now() + 3600000),
      dueAt: new Date(Date.now() + 7200000),
    },
  });
  const beforeDeadline = await getTeacherStudentAssignments(
    ids.teacherId,
    ids.lateStudentId,
    teacherStudentDetailQuerySchema.parse({
      classroomId: classroom.id,
      section: "ALL",
    }),
  );
  assert.equal(
    beforeDeadline.items.some((item) => item.id === scheduled.id),
    false,
    "UTC raw SQL must exclude near-future scheduled work",
  );
  assert.equal(
    beforeDeadline.items.find((item) => item.id === task.id)?.overdue,
    false,
    "one hour before deadline is not overdue in a non-UTC database session",
  );
  async function fill(studentId: string, submissionId: string, value: boolean) {
    const draft = await getStudentSubmissionDraft(studentId, submissionId);
    await saveStudentAnswers(studentId, submissionId, {
      version: draft.version,
      answers: [
        { assignmentQuestionId: task.questions[0].id, kind: "BOOLEAN", value },
      ],
    });
  }
  const first = await startOrResumeAttempt(
    ids.studentId,
    task.id,
    randomUUID(),
  );
  await fill(ids.studentId, first.id, true);
  await submitStudentAssignment(ids.studentId, first.id);
  const request = {
    requestId: randomUUID(),
    studentIds: [ids.studentId, ids.lateStudentId],
    expiresAt: new Date(Date.now() + 600000),
    reason: "隔离补交与重做验收",
  };
  await assert.rejects(
    issueAssignmentMakeup(ids.teacherId, task.id, request, context),
    /截止后/,
  );
  await prisma.assignment.update({
    where: { id: task.id },
    data: { dueAt: new Date(Date.now() - 60000) },
  });
  await assert.rejects(
    issueAssignmentMakeup(ids.otherTeacherId, task.id, request, context),
  );
  await assert.rejects(
    issueAssignmentMakeup(
      ids.teacherId,
      task.id,
      { ...request, requestId: randomUUID(), studentIds: [ids.otherTeacherId] },
      context,
    ),
  );
  const granted = await issueAssignmentMakeup(
    ids.teacherId,
    task.id,
    request,
    context,
  );
  assert.equal(
    granted.grants.find((g) => g.studentId === ids.studentId)?.kind,
    "REDO",
  );
  assert.equal(
    granted.grants.find((g) => g.studentId === ids.lateStudentId)?.kind,
    "MAKEUP",
  );
  const retry = await issueAssignmentMakeup(
    ids.teacherId,
    task.id,
    request,
    context,
  );
  assert.equal(retry.reused, true);
  await assert.rejects(
    issueAssignmentMakeup(
      ids.teacherId,
      task.id,
      { ...request, reason: "更改同一请求" },
      context,
    ),
    /不能更改/,
  );
  await assert.rejects(
    issueAssignmentMakeup(
      ids.teacherId,
      task.id,
      { ...request, requestId: randomUUID() },
      context,
    ),
    /已有有效授权/,
  );
  assert.equal(
    (await getAssignmentPublicationState(ids.teacherId, task.id)).canPublish,
    false,
  );
  await assert.rejects(
    publishAssignmentResults(ids.teacherId, task.id, context),
    /补交|重做/,
  );
  const redo = await startOrResumeAttempt(ids.studentId, task.id, randomUUID());
  assert.notEqual(redo.id, first.id);
  assert.equal(
    (await startOrResumeAttempt(ids.studentId, task.id, randomUUID())).id,
    redo.id,
  );
  assert.equal(
    (
      await prisma.submission.findUniqueOrThrow({ where: { id: first.id } })
    ).score?.toNumber(),
    20,
    "new draft must not replace the old result",
  );
  await fill(ids.studentId, redo.id, false);
  await Promise.all([
    submitStudentAssignment(ids.studentId, redo.id),
    submitStudentAssignment(ids.studentId, redo.id),
  ]);
  assert.equal(
    (
      await prisma.submission.findUniqueOrThrow({ where: { id: redo.id } })
    ).score?.toNumber(),
    0,
    "redo follows original grading; zero remains a real score",
  );
  assert.equal(
    await prisma.assignmentMakeupGrant.count({
      where: { submissionId: redo.id, status: "USED" },
    }),
    1,
  );
  await assert.rejects(
    startOrResumeAttempt(ids.studentId, task.id, randomUUID()),
    /截止/,
  );
  const makeup = await startOrResumeAttempt(
    ids.lateStudentId,
    task.id,
    randomUUID(),
  );
  await fill(ids.lateStudentId, makeup.id, true);
  const lateGrant = granted.grants.find(
    (g) => g.studentId === ids.lateStudentId,
  );
  assert.ok(lateGrant);
  const extraRedo = await issueAssignmentMakeup(
    ids.teacherId,
    task.id,
    { ...request, studentIds: [ids.studentId], requestId: randomUUID() },
    context,
  );
  const extraDraft = await startOrResumeAttempt(
    ids.studentId,
    task.id,
    randomUUID(),
  );
  const extendedDate = new Date(Date.now() + 3600000);
  const extension = {
    requestId: randomUUID(),
    dueAt: extendedDate,
    reason: "延长全班期限",
  };
  await runAssignmentDueReminders();
  assert.ok(
    await prisma.notification.count({
      where: {
        sourceId: task.id,
        type: "ASSIGNMENT_DUE_SOON",
        expiresAt: { gt: new Date() },
      },
    }),
  );
  await extendAssignmentDeadline(ids.teacherId, task.id, extension, context);
  assert.equal(
    await prisma.notification.count({
      where: {
        sourceId: task.id,
        type: "ASSIGNMENT_DUE_SOON",
        expiresAt: { gt: new Date() },
      },
    }),
    0,
    "old deadline reminders expire when the deadline changes",
  );
  await runAssignmentDueReminders();
  assert.ok(
    await prisma.notification.count({
      where: {
        sourceId: task.id,
        type: "ASSIGNMENT_DUE_SOON",
        expiresAt: extendedDate,
      },
    }),
    "the new effective deadline receives a distinct reminder",
  );
  assert.equal(
    (
      await prisma.assignmentMakeupGrant.findUniqueOrThrow({
        where: { id: lateGrant.id },
      })
    ).expiresAt.getTime(),
    extendedDate.getTime(),
  );
  assert.equal(
    (await issueAssignmentMakeup(ids.teacherId, task.id, request, context))
      .reused,
    true,
    "extension must not alter original idempotency parameters",
  );
  assert.equal(
    (
      await getStudentSubmissionDraft(ids.lateStudentId, makeup.id)
    ).dueAt?.getTime(),
    extendedDate.getTime(),
  );
  await assert.rejects(
    extendAssignmentDeadline(
      ids.teacherId,
      task.id,
      { ...extension, dueAt: new Date(extendedDate.getTime() - 1) },
      context,
    ),
    /晚于原截止/,
  );
  assert.equal(
    (await extendAssignmentDeadline(ids.teacherId, task.id, extension, context))
      .changed,
    false,
  );
  await revokeAssignmentMakeup(
    ids.teacherId,
    task.id,
    extraRedo.grants[0].id,
    { reason: "撤销额外重做" },
    context,
  );
  await assert.rejects(
    saveStudentAnswers(ids.studentId, extraDraft.id, {
      version: 0,
      answers: [],
    }),
    /不允许重复提交/,
  );
  await assert.rejects(
    submitStudentAssignment(ids.studentId, extraDraft.id),
    /不允许重复提交/,
  );
  assert.equal(
    (await getStudentSubmissionDraft(ids.studentId, extraDraft.id)).canWrite,
    false,
  );
  await revokeAssignmentMakeup(
    ids.teacherId,
    task.id,
    lateGrant.id,
    { reason: "撤销验收" },
    context,
  );
  // After the whole-class extension normal attempts remain governed by allowResubmission.
  await assert.rejects(
    startOrResumeAttempt(ids.studentId, task.id, randomUUID()),
    /重复提交/,
  );
  await prisma.assignment.update({
    where: { id: task.id },
    data: { dueAt: new Date(Date.now() - 60000) },
  });
  await assert.rejects(
    saveStudentAnswers(ids.lateStudentId, makeup.id, {
      version: 1,
      answers: [],
    }),
    /截止/,
  );
  const newRequest = {
    ...request,
    requestId: randomUUID(),
    studentIds: [ids.lateStudentId],
    expiresAt: new Date(Date.now() + 3600000),
  };
  const reissued = await issueAssignmentMakeup(
    ids.teacherId,
    task.id,
    newRequest,
    context,
  );
  assert.equal(
    (await startOrResumeAttempt(ids.lateStudentId, task.id, randomUUID())).id,
    makeup.id,
    "revoked draft can be restored by a new grant",
  );
  await submitStudentAssignment(ids.lateStudentId, makeup.id);
  assert.equal(
    (
      await prisma.submission.findUniqueOrThrow({ where: { id: makeup.id } })
    ).score?.toNumber(),
    20,
    "no automatic makeup penalty",
  );
  assert.equal(
    (await getAssignmentPublicationState(ids.teacherId, task.id)).canPublish,
    true,
  );
  await assert.rejects(
    revokeAssignmentMakeup(
      ids.teacherId,
      task.id,
      reissued.grants[0].id,
      { reason: "已用不可撤" },
      context,
    ),
    /已使用/,
  );
  await publishAssignmentResults(ids.teacherId, task.id, context);
  await assert.rejects(
    extendAssignmentDeadline(
      ids.teacherId,
      task.id,
      { ...extension, dueAt: new Date(Date.now() + 7200000) },
      context,
    ),
    /已公布|已经公布/,
  );
  await assert.rejects(
    issueAssignmentMakeup(
      ids.teacherId,
      task.id,
      { ...newRequest, requestId: randomUUID() },
      context,
    ),
    /已经公布/,
  );
  const {
    assignments: [withdrawnTask],
  } = await createAssignmentBatch(ids.teacherId, {
    ...input,
    requestId: randomUUID(),
    assignment: { ...input.assignment, title: "撤回后的授权" },
  });
  const withdrawn = await startOrResumeAttempt(
    ids.studentId,
    withdrawnTask.id,
    randomUUID(),
  );
  await prisma.submission.update({
    where: { id: withdrawn.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() },
  });
  await prisma.assignment.update({
    where: { id: withdrawnTask.id },
    data: { dueAt: new Date(Date.now() - 60000) },
  });
  const withdrawnGrant = await issueAssignmentMakeup(
    ids.teacherId,
    withdrawnTask.id,
    { ...newRequest, studentIds: [ids.studentId], requestId: randomUUID() },
    context,
  );
  assert.equal(withdrawnGrant.grants[0].kind, "MAKEUP");
  const recovered = await startOrResumeAttempt(
    ids.studentId,
    withdrawnTask.id,
    randomUUID(),
  );
  assert.equal(
    recovered.attemptNumber,
    withdrawn.attemptNumber + 1,
    "withdrawn attempts retain their sequence numbers",
  );
  const {
    assignments: [attachmentTask],
  } = await createAssignmentBatch(ids.teacherId, {
    ...input,
    requestId: randomUUID(),
    assignment: {
      ...input.assignment,
      title: "附件补交",
      questions: [],
      allowAttachments: true,
      submissionTask: {
        prompt: "提交实验截图",
        referenceAnswer: "依据报告评分",
        points: 100,
        resourceFileIds: [],
      },
    },
  });
  await prisma.assignment.update({
    where: { id: attachmentTask.id },
    data: { dueAt: new Date(Date.now() - 60000) },
  });
  const attachmentGrant = await issueAssignmentMakeup(
    ids.teacherId,
    attachmentTask.id,
    { ...newRequest, requestId: randomUUID() },
    context,
  );
  const attachmentDraft = await startOrResumeAttempt(
    ids.lateStudentId,
    attachmentTask.id,
    randomUUID(),
  );
  const studentUser = await prisma.user.findUniqueOrThrow({
    where: { id: ids.lateStudentId },
  });
  const actor = {
    id: studentUser.id,
    email: studentUser.email,
    role: studentUser.role,
    displayName: null,
    mustChangePassword: false,
  };
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const file = () =>
    new File([new Uint8Array(image)], "补交截图.png", { type: "image/png" });
  await uploadSubmissionAttachment(
    actor,
    attachmentDraft.id,
    attachmentTask.questions[0].id,
    file(),
    context,
  );
  await revokeAssignmentMakeup(
    ids.teacherId,
    attachmentTask.id,
    attachmentGrant.grants[0].id,
    { reason: "撤销附件补交" },
    context,
  );
  await assert.rejects(
    uploadSubmissionAttachment(
      actor,
      attachmentDraft.id,
      attachmentTask.questions[0].id,
      file(),
      context,
    ),
    /截止/,
  );
  assert.equal(
    await prisma.submissionAttachment.count({
      where: { submissionId: attachmentDraft.id, deletedAt: null },
    }),
    1,
    "revocation must not remove uploaded evidence",
  );
  const {
    assignments: [expiring],
  } = await createAssignmentBatch(ids.teacherId, {
    ...input,
    requestId: randomUUID(),
    assignment: { ...input.assignment, title: "授权到期与结课" },
  });
  await prisma.assignment.update({
    where: { id: expiring.id },
    data: { dueAt: new Date(Date.now() - 60000) },
  });
  const exp = await issueAssignmentMakeup(
    ids.teacherId,
    expiring.id,
    { ...newRequest, requestId: randomUUID() },
    context,
  );
  await prisma.assignmentMakeupGrant.update({
    where: { id: exp.grants[0].id },
    data: {
      requestedExpiresAt: new Date(Date.now() - 1000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  assert.equal(
    (await readStudentWorkAccess(expiring.id, ids.lateStudentId)).canWrite,
    false,
  );
  await runAssignmentDueReminders();
  assert.equal(
    (
      await prisma.assignmentMakeupGrant.findUniqueOrThrow({
        where: { id: exp.grants[0].id },
      })
    ).status,
    "EXPIRED",
  );
  const live = await issueAssignmentMakeup(
    ids.teacherId,
    expiring.id,
    { ...newRequest, requestId: randomUUID() },
    context,
  );
  await completeClassroom(ids.teacherId, classroom.id, context);
  assert.equal(
    (await readStudentWorkAccess(expiring.id, ids.lateStudentId)).canWrite,
    false,
  );
  assert.equal(
    (
      await prisma.assignmentMakeupGrant.findUniqueOrThrow({
        where: { id: live.grants[0].id },
      })
    ).status,
    "EXPIRED",
  );
  assert.equal(
    (await getAssignmentPublicationState(ids.teacherId, expiring.id))
      .canPublish,
    false,
    "no scores to fabricate after teaching ends",
  );
  console.log(
    "Makeup integration passed: ownership, one-use redo/makeup, concurrent submit, preserved old result, full extension, revoke/expiry, publication protection, reminder expiration and class completion.",
  );
}
