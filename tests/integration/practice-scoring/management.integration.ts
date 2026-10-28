import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../../lib/prisma";
import { integrationPrisma } from "../recommendations/database";
import { RecommendationTestFactory } from "../recommendations/factories";
import {
  managePracticeSet,
  managePracticeSets,
} from "../../../services/practice-sets/management";
import {
  getPracticeSet,
  listPracticeSets,
} from "../../../services/practice-sets/service";
import {
  startRecommendation,
  getRecommendationDetail,
} from "../../../services/recommendations/service";
import { submitRecommendationPractice } from "../../../services/recommendations/practice";
async function setup(label: string) {
  const factory = new RecommendationTestFactory(label);
  const teacher = await factory.teacher(),
    student = await factory.student(),
    other = await factory.student();
  const question = await factory.question(teacher.id, { type: "TRUE_FALSE" });
  let created = 0;
  const create = async (studentId = student.id) => {
    const target =
      created++ === 0
        ? question
        : await factory.question(teacher.id, { type: "TRUE_FALSE" });
    return prisma.personalizedRecommendation.create({
      data: {
        studentId,
        questionId: target.id,
        cycleKey: randomUUID(),
        source: "RULE",
        reason: "management test",
        targetDifficulty: 3,
      },
    });
  };
  return {
    factory,
    actor: factory.actor(student),
    other: factory.actor(other),
    question,
    create,
  };
}
test("rename, trash, restore and old links preserve raw results and remain read-only", async () => {
  const { actor, question, create } = await setup("management");
  const record = await create();
  const renamed = await managePracticeSet(actor, record.id, {
    action: "RENAME",
    title: "我的循环复习",
    expectedRevision: 0,
  });
  assert.equal(renamed.revision, 1);
  assert.equal((await getPracticeSet(actor, record.id)).title, "我的循环复习");
  await startRecommendation(actor, record.id);
  await submitRecommendationPractice(actor, record.id, {
    idempotencyKey: randomUUID(),
    answers: [{ questionId: question.id, kind: "BOOLEAN", value: true }],
  });
  const raw = await prisma.recommendationPracticeAnswer.findUniqueOrThrow({
    where: { recommendationId: record.id },
  });
  const evidenceCount = await prisma.learningEvent.count();
  const trash = await managePracticeSet(actor, record.id, {
    action: "TRASH",
    expectedRevision: 1,
  });
  assert.ok(trash.endedAt);
  assert.ok(trash.trashedAt);
  assert.equal(
    (await listPracticeSets(actor, { section: "TRASH" })).items.some(
      (item) => item.id === record.id,
    ),
    true,
  );
  assert.equal(
    (await listPracticeSets(actor, { section: "HISTORY" })).items.some(
      (item) => item.id === record.id,
    ),
    false,
  );
  const duplicate = await managePracticeSet(actor, record.id, {
    action: "TRASH",
    expectedRevision: 1,
  });
  assert.equal(duplicate.revision, trash.revision);
  const restored = await managePracticeSet(actor, record.id, {
    action: "RESTORE",
    expectedRevision: trash.revision,
  });
  assert.equal(restored.trashedAt, null);
  assert.ok(restored.endedAt);
  assert.equal(
    (await getRecommendationDetail(actor, record.id)).readOnly,
    true,
  );
  assert.equal((await getPracticeSet(actor, record.id)).status, "COMPLETED");
  await assert.rejects(startRecommendation(actor, record.id));
  await assert.rejects(
    submitRecommendationPractice(actor, record.id, {
      idempotencyKey: randomUUID(),
      answers: [{ questionId: question.id, kind: "BOOLEAN", value: false }],
    }),
  );
  const saved = await prisma.recommendationPracticeAnswer.findUniqueOrThrow({
    where: { recommendationId: record.id },
  });
  assert.equal(saved.score.toString(), raw.score.toString());
  assert.equal(saved.maxScore.toString(), raw.maxScore.toString());
  assert.equal(await prisma.learningEvent.count(), evidenceCount);
});
test("batch ownership and revision errors roll back the entire selection", async () => {
  const { actor, other, create } = await setup("batch");
  const own = await create(),
    second = await create(),
    foreign = await create(other.id);
  await assert.rejects(
    managePracticeSets(actor, {
      action: "TRASH",
      items: [
        { id: own.id, expectedRevision: 0 },
        { id: foreign.id, expectedRevision: 0 },
      ],
    }),
  );
  assert.equal(
    (await getPracticeSet(actor, own.id)).management?.trashedAt,
    null,
  );
  await managePracticeSet(actor, second.id, {
    action: "RENAME",
    title: "新版名称",
    expectedRevision: 0,
  });
  await assert.rejects(
    managePracticeSets(actor, {
      action: "TRASH",
      items: [
        { id: own.id, expectedRevision: 0 },
        { id: second.id, expectedRevision: 0 },
      ],
    }),
  );
  assert.equal(
    (await getPracticeSet(actor, own.id)).management?.trashedAt,
    null,
  );
  await managePracticeSets(actor, {
    action: "TRASH",
    items: [
      { id: own.id, expectedRevision: 0 },
      { id: second.id, expectedRevision: 1 },
    ],
  });
  assert.ok((await getPracticeSet(actor, own.id)).management?.trashedAt);
  await managePracticeSets(actor, {
    action: "RESTORE",
    items: [
      { id: own.id, expectedRevision: 1 },
      { id: second.id, expectedRevision: 2 },
    ],
  });
  assert.equal((await getPracticeSet(actor, own.id)).status, "EXPIRED");
  await assert.rejects(
    managePracticeSet(other, own.id, {
      action: "RENAME",
      title: "越权",
      expectedRevision: 2,
    }),
  );
  await assert.rejects(
    managePracticeSet({ ...actor, role: "TEACHER" }, own.id, {
      action: "END",
      expectedRevision: 2,
    }),
  );
});
test("concurrent rename uses revisions; concurrent end and start cannot reopen a group", async () => {
  const { actor, create } = await setup("concurrent");
  const record = await create();
  const renames = await Promise.allSettled([
    managePracticeSet(actor, record.id, {
      action: "RENAME",
      title: "A",
      expectedRevision: 0,
    }),
    managePracticeSet(actor, record.id, {
      action: "RENAME",
      title: "B",
      expectedRevision: 0,
    }),
  ]);
  assert.equal(
    renames.filter((result) => result.status === "fulfilled").length,
    1,
  );
  await Promise.allSettled([
    managePracticeSet(actor, record.id, { action: "END", expectedRevision: 1 }),
    startRecommendation(actor, record.id),
  ]);
  const detail = await getRecommendationDetail(actor, record.id);
  assert.ok(detail.management?.endedAt);
  assert.equal(detail.readOnly, true);
  assert.equal((await getPracticeSet(actor, record.id)).status, "EXPIRED");
  await assert.rejects(startRecommendation(actor, record.id));
});
test("list sections, course validation, search, stable paging and missing management compatibility", async () => {
  const { actor, create } = await setup("list");
  const records = [];
  for (let i = 0; i < 21; i++) records.push(await create());
  assert.equal((await listPracticeSets(actor, {})).total, 21);
  const page = await listPracticeSets(actor, { page: 2 });
  assert.equal(page.items.length, 1);
  const record = page.items[0];
  await managePracticeSet(actor, record.id, {
    action: "TRASH",
    expectedRevision: 0,
  });
  const clamped = await listPracticeSets(actor, { page: 2 });
  assert.equal(clamped.page, 1);
  assert.equal(clamped.items.length, 20);
  await managePracticeSet(actor, clamped.items[0].id, {
    action: "RENAME",
    title: "独有搜索名",
    expectedRevision: 0,
  });
  assert.equal(
    (await listPracticeSets(actor, { keyword: "独有搜索名" })).total,
    1,
  );
  await assert.rejects(listPracticeSets(actor, { courseId: "foreign-course" }));
  assert.equal(
    (await listPracticeSets(actor, { status: "EXPIRED" })).section,
    "HISTORY",
  );
});
test.after(async () => {
  await Promise.all([prisma.$disconnect(), integrationPrisma.$disconnect()]);
});

test("favorites reject unavailable course parameters without widening list scope", async () => {
  const { actor } = await setup("favorites-scope");
  const { listFavorites } =
    await import("../../../services/question-favorites/service");
  await assert.rejects(
    () => listFavorites(actor, { courseId: "nonexistent-course" }),
    /课程不存在或无权访问/,
  );
  const result = await listFavorites(actor, { courseId: "GENERAL" });
  assert.equal(result.total, 0);
  assert.equal(result.items.length, 0);
});
