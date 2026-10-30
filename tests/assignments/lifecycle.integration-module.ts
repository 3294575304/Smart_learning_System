import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type {
  AssignmentStatus,
  ClassroomStatus,
  MembershipStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  completeSubmissionGrading,
  getAssignmentPublicationState,
  getTeacherSubmissionForGrading,
  publishAssignmentResults,
  saveManualAnswerGrade,
} from "@/services/assignments/manual-grading";
import { ResourceNotFoundError } from "@/services/auth/policy";

export async function verifyAssignmentLifecycle(ids: {
  teacherId: string;
  otherTeacherId: string;
  studentId: string;
  courseId: string;
}) {
  const context = { ipAddress: null, userAgent: "isolated-lifecycle-test" };
  const source = await prisma.question.findFirstOrThrow({
    where: { type: "SHORT_ANSWER" },
  });
  async function fixture(
    options: {
      classroomStatus?: ClassroomStatus;
      assignmentStatus?: AssignmentStatus;
      membershipStatus?: MembershipStatus;
      pending?: boolean;
    } = {},
  ) {
    const classroom = await prisma.classroom.create({
      data: {
        teacherId: ids.teacherId,
        courseId: ids.courseId,
        name: "状态边界隔离班",
        joinCode: randomUUID(),
        status: options.classroomStatus ?? "ACTIVE",
        memberships: {
          create: {
            studentId: ids.studentId,
            status: options.membershipStatus ?? "ACTIVE",
            joinedAt: new Date(Date.now() - 1000),
            endedAt: options.membershipStatus === "REMOVED" ? new Date() : null,
          },
        },
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        teacherId: ids.teacherId,
        classroomId: classroom.id,
        title: "状态边界隔离作业",
        status: options.assignmentStatus ?? "PUBLISHED",
        totalPoints: 20,
        publishedAt: new Date(Date.now() - 86400000),
        dueAt: new Date(Date.now() + 86400000),
        questions: {
          create: {
            questionId: source.id,
            sortOrder: 1,
            points: 20,
            titleSnapshot: source.title,
            contentSnapshot: source.content,
            typeSnapshot: "SHORT_ANSWER",
            difficultySnapshot: 1,
            explanationSnapshot: "隔离测试",
            referenceAnswerSnapshot: "评分参考",
          },
        },
      },
      include: { questions: true },
    });
    const submission = await prisma.submission.create({
      data: {
        assignmentId: assignment.id,
        studentId: ids.studentId,
        idempotencyKey: randomUUID(),
        status: options.pending ? "PENDING_REVIEW" : "GRADED",
        startedAt: new Date(Date.now() - 1000),
        submittedAt: new Date(),
        score: options.pending ? null : 16,
        maxScore: options.pending ? null : 20,
        percentage: options.pending ? null : 80,
        gradedAt: options.pending ? null : new Date(),
        answers: {
          create: {
            assignmentQuestionId: assignment.questions[0].id,
            textAnswer: "个人答案",
            maxScore: 20,
            score: options.pending ? null : 16,
            gradingStatus: options.pending
              ? "MANUAL_REVIEW_REQUIRED"
              : "GRADED",
          },
        },
      },
      include: { answers: true },
    });
    return { assignment, submission };
  }
  const active = await fixture();
  assert.match(
    (await getAssignmentPublicationState(ids.teacherId, active.assignment.id))
      .blockedReason ?? "",
    /尚未截止/,
  );
  await assert.rejects(
    publishAssignmentResults(ids.teacherId, active.assignment.id, context),
    /尚未截止/,
  );
  assert.equal(
    (
      await prisma.submission.findUniqueOrThrow({
        where: { id: active.submission.id },
      })
    ).status,
    "GRADED",
  );
  await prisma.assignment.update({
    where: { id: active.assignment.id },
    data: { dueAt: new Date(Date.now() - 1) },
  });
  assert.equal(
    (await getAssignmentPublicationState(ids.teacherId, active.assignment.id))
      .canPublish,
    true,
  );
  await publishAssignmentResults(ids.teacherId, active.assignment.id, context);
  await publishAssignmentResults(ids.teacherId, active.assignment.id, context);
  assert.equal(
    (
      await prisma.submission.findUniqueOrThrow({
        where: { id: active.submission.id },
      })
    ).status,
    "PUBLISHED",
  );
  for (const classroomStatus of ["COMPLETED", "CLOSED"] as const) {
    const ended = await fixture({ classroomStatus });
    assert.equal(
      (
        await getTeacherSubmissionForGrading(
          ids.teacherId,
          ended.assignment.id,
          ended.submission.id,
        )
      ).canManageGrading,
      true,
    );
    assert.equal(
      (await getAssignmentPublicationState(ids.teacherId, ended.assignment.id))
        .canPublish,
      true,
    );
    await publishAssignmentResults(ids.teacherId, ended.assignment.id, context);
  }
  for (const options of [
    { assignmentStatus: "ARCHIVED" as const },
    { classroomStatus: "ARCHIVED" as const },
    { membershipStatus: "REMOVED" as const },
  ]) {
    const frozen = await fixture({ ...options, pending: true });
    const before = await prisma.studentAnswer.findUniqueOrThrow({
      where: { id: frozen.submission.answers[0].id },
    });
    const detail = await getTeacherSubmissionForGrading(
      ids.teacherId,
      frozen.assignment.id,
      frozen.submission.id,
    );
    assert.equal(detail.canManageGrading, false);
    assert.ok(detail.gradingBlockedReason);
    await assert.rejects(
      saveManualAnswerGrade(
        ids.teacherId,
        frozen.assignment.id,
        frozen.submission.id,
        before.id,
        { score: 10, feedback: "不应保存" },
        context,
      ),
      /只读|仅供查看/,
    );
    await assert.rejects(
      completeSubmissionGrading(
        ids.teacherId,
        frozen.assignment.id,
        frozen.submission.id,
        context,
      ),
      /只读|仅供查看/,
    );
    if (options.membershipStatus !== "REMOVED") {
      await assert.rejects(
        publishAssignmentResults(ids.teacherId, frozen.assignment.id, context),
        /只读/,
      );
    }
    assert.deepEqual(
      await prisma.studentAnswer.findUniqueOrThrow({
        where: { id: before.id },
      }),
      before,
    );
    await assert.rejects(
      getTeacherSubmissionForGrading(
        ids.otherTeacherId,
        frozen.assignment.id,
        frozen.submission.id,
      ),
      ResourceNotFoundError,
    );
  }
  const pending = await fixture({ pending: true });
  await prisma.assignment.update({
    where: { id: pending.assignment.id },
    data: { dueAt: new Date(Date.now() - 1) },
  });
  assert.equal(
    (await getAssignmentPublicationState(ids.teacherId, pending.assignment.id))
      .canPublish,
    false,
  );
  await assert.rejects(
    publishAssignmentResults(ids.teacherId, pending.assignment.id, context),
  );
  console.log(
    "Lifecycle integration passed: deadline publication, ended-class processing, archive/history read-only, ownership and pending-review protection.",
  );
}
