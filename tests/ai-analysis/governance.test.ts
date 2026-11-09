import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { prisma } from "@/lib/prisma";
import { loadAIGatewayOverview } from "@/services/admin/dashboard/repository";
import {
  createAIAttemptRunner,
  reserveAIQuota,
} from "@/services/ai/governance";
import type { AIProviderResponse } from "@/services/ai/provider";
import { hasActiveExamAttempt } from "@/services/exams/assistant-policy";

const database = new URL(process.env.DATABASE_URL ?? "");
assert.match(
  database.searchParams.get("schema") ?? "",
  /^unit_it_[a-z0-9_]+$/u,
);
after(() => prisma.$disconnect());

test("强制配额并发仅接受六个请求，后台重试复用预占并保留独立调用日志", async () => {
  const actor = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  assert.ok(actor.schoolId);
  const previousMode = process.env.AI_QUOTA_MODE;
  const start = new Date();
  const response: AIProviderResponse = {
    content: {},
    requestId: "provider-test",
    finishReason: "stop",
    responseLength: 0,
    usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 },
  };
  let calls = 0;
  const invoke = async () => {
    calls++;
    return response;
  };
  const signal = new AbortController().signal;
  try {
    process.env.AI_QUOTA_MODE = "enforce";
    const runners = Array.from({ length: 8 }, () =>
      createAIAttemptRunner(
        {
          capability: "assignment_suggestion",
          actorId: actor.id,
          requestId: randomUUID(),
        },
        "test",
      ),
    );
    const attempts = await Promise.allSettled(
      runners.map((runner) => runner(signal, "generate", invoke)),
    );
    assert.equal(
      attempts.filter((item) => item.status === "fulfilled").length,
      6,
    );
    for (const attempt of attempts)
      if (attempt.status === "rejected")
        assert.equal(attempt.reason.code, "PROVIDER_LOCAL_QUOTA_EXCEEDED");
    const acceptedIndex = attempts.findIndex(
      (item) => item.status === "fulfilled",
    );
    await runners[acceptedIndex](signal, "review", invoke);
    assert.equal(calls, 7);
    process.env.AI_QUOTA_MODE = "shadow";
    await createAIAttemptRunner(
      { capability: "assignment_suggestion", actorId: actor.id },
      "test",
    )(signal, "generate", invoke);
    const rows = await loadAIGatewayOverview(
      actor.schoolId,
      start,
      new Date(Date.now() + 1_000),
    );
    const row = rows.find(
      (value) => value.capability === "assignment_suggestion",
    );
    assert.equal(row?.requests, 9);
    assert.equal(row?.attempts, 8);
    assert.equal(row?.wouldLimit, 3);
    assert.equal(row?.rejected, 2);
    assert.equal(row?.totalTokens, 80);
    assert.deepEqual(
      await loadAIGatewayOverview(
        "different-school",
        start,
        new Date(Date.now() + 1_000),
      ),
      [],
    );
  } finally {
    if (previousMode === undefined) delete process.env.AI_QUOTA_MODE;
    else process.env.AI_QUOTA_MODE = previousMode;
  }
});

test("批量出题按题量预占，本校两个发起人并发共享学校额度", async () => {
  const actor = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
  });
  assert.ok(actor.schoolId);
  await prisma.aIQuotaReservation.create({
    data: {
      key: randomUUID(),
      actorId: "previous-teacher",
      schoolId: actor.schoolId,
      capability: "question_generation",
      units: 3_980,
      createdAt: new Date(),
    },
  });
  const result = await Promise.all(
    ["batch-actor-one", "batch-actor-two"].map((actorId) =>
      reserveAIQuota(
        { capability: "question_generation", actorId, units: 20 },
        randomUUID(),
        actor.schoolId,
        "enforce",
      ),
    ),
  );
  assert.equal(result.filter((item) => item.accepted).length, 1);
  const aggregate = await prisma.aIQuotaReservation.aggregate({
    where: { capability: "question_generation", schoolId: actor.schoolId },
    _sum: { units: true },
  });
  assert.equal(aggregate._sum.units, 4_000);
});

test("仅限制已进入且未交卷的有效正式考试", async () => {
  const classroom = await prisma.classroom.findFirstOrThrow({
    where: { memberships: { some: {} } },
    include: { memberships: { take: 1 } },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow();
  const course = await prisma.course.create({
    data: {
      teacher: { connect: { id: classroom.teacherId } },
      template: { connect: { id: template.id } },
      questionCategory: {
        create: { name: "门禁测试", normalizedName: "assistant-exam-policy" },
      },
      name: "门禁测试",
      courseNo: "ASSISTANT-EXAM-TEST",
      term: "2026",
      status: "ACTIVE",
    },
  });
  const { studentId } = classroom.memberships[0];
  const now = new Date();
  const assignment = await prisma.assignment.create({
    data: {
      classroomId: classroom.id,
      teacherId: classroom.teacherId,
      title: "门禁测试",
      status: "PUBLISHED",
    },
  });
  const submission = await prisma.submission.create({
    data: {
      studentId,
      assignmentId: assignment.id,
      idempotencyKey: randomUUID(),
      startedAt: now,
    },
  });
  assert.equal(await hasActiveExamAttempt(studentId, now), false);
  const exam = await prisma.examSession.create({
    data: {
      requestId: randomUUID(),
      requestFingerprint: "a".repeat(64),
      teacherId: classroom.teacherId,
      courseId: course.id,
      questionCategoryId: course.questionCategoryId,
      type: "MIDTERM",
      title: "门禁测试考试",
      startsAt: now,
      endsAt: new Date(now.getTime() + 60_000),
    },
  });
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { examSessionId: exam.id },
  });
  assert.equal(await hasActiveExamAttempt(studentId, now), true);
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { status: "REVOKED", deletedAt: now },
  });
  assert.equal(await hasActiveExamAttempt(studentId, now), false);
  await prisma.assignment.update({
    where: { id: assignment.id },
    data: { status: "PUBLISHED", deletedAt: null },
  });
  assert.equal(
    await hasActiveExamAttempt(studentId, new Date(now.getTime() - 1)),
    false,
  );
  assert.equal(await hasActiveExamAttempt(studentId, exam.endsAt), false);
  await prisma.examSession.update({
    where: { id: exam.id },
    data: { cancelledAt: now },
  });
  assert.equal(await hasActiveExamAttempt(studentId, now), false);
  await prisma.examSession.update({
    where: { id: exam.id },
    data: { cancelledAt: null },
  });
  await prisma.submission.update({
    where: { id: submission.id },
    data: { status: "PENDING_REVIEW", submittedAt: now },
  });
  assert.equal(await hasActiveExamAttempt(studentId, now), false);
});
