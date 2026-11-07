import {
  AuthorizationError,
  ResourceNotFoundError,
} from "../../../services/auth/policy";
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
  listRecommendations,
} from "../../../services/recommendations/service";
import { submitRecommendationPractice } from "../../../services/recommendations/practice";
import {
  getPracticeAccountDraft,
  PracticeDraftConflict,
  savePracticeAccountDraft,
} from "../../../services/practice-sets/draft-service";
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
test("permanent removal is trash-only, private, and preserves scores and evidence", async () => {
  const { actor, other, question, create } = await setup("purge");
  const first = await create();
  const second = await create();
  const foreign = await create(other.id);
  await startRecommendation(actor, first.id);
  await submitRecommendationPractice(actor, first.id, {
    idempotencyKey: randomUUID(),
    answers: [{ questionId: question.id, kind: "BOOLEAN", value: true }],
  });
  const where = { recommendationId: first.id };
  const saved = await prisma.recommendationPracticeAnswer.findUniqueOrThrow({
    where,
  });
  const evidenceCount = await prisma.learningEvent.count();
  const trash = await managePracticeSet(actor, first.id, {
    action: "TRASH",
    expectedRevision: 0,
  });
  const firstItem = { id: first.id, expectedRevision: trash.revision };
  const purge = { action: "PURGE", expectedRevision: trash.revision };
  await assert.rejects(
    managePracticeSet(actor, first.id, {
      ...purge,
      expectedRevision: 0,
    }),
    { status: 409 },
  );
  await assert.rejects(
    managePracticeSets(actor, {
      action: "PURGE",
      items: [firstItem, { id: foreign.id, expectedRevision: 0 }],
    }),
    ResourceNotFoundError,
  );
  await assert.rejects(
    managePracticeSets(actor, {
      action: "PURGE",
      items: [firstItem, { id: second.id, expectedRevision: 0 }],
    }),
    { status: 409 },
  );
  assert.equal((await listPracticeSets(actor, { section: "TRASH" })).total, 1);
  const secondTrash = await managePracticeSet(actor, second.id, {
    action: "TRASH",
    expectedRevision: 0,
  });
  await managePracticeSets(actor, {
    action: "PURGE",
    items: [
      firstItem,
      { id: second.id, expectedRevision: secondTrash.revision },
    ],
  });
  const removed = await managePracticeSet(actor, first.id, purge);
  assert.ok(removed.purgedAt);
  assert.equal(removed.revision, trash.revision + 1);
  for (const section of ["ACTIVE", "HISTORY", "TRASH"]) {
    assert.equal((await listPracticeSets(actor, { section })).total, 0);
  }
  assert.equal((await listRecommendations(actor, {})).items.length, 0);
  await assert.rejects(getPracticeSet(actor, first.id), ResourceNotFoundError);
  await assert.rejects(
    getRecommendationDetail(actor, first.id),
    ResourceNotFoundError,
  );
  await assert.rejects(
    startRecommendation(actor, first.id),
    ResourceNotFoundError,
  );
  await assert.rejects(
    managePracticeSet(actor, first.id, {
      action: "RESTORE",
      expectedRevision: removed.revision,
    }),
    ResourceNotFoundError,
  );
  assert.deepEqual(
    await prisma.recommendationPracticeAnswer.findUniqueOrThrow({ where }),
    saved,
  );
  assert.equal(await prisma.learningEvent.count(), evidenceCount);
});

test("account drafts share a group revision and preserve only unsubmitted history", async () => {
  const { actor, other, question, create } = await setup("account_draft");
  const first = await create();
  const second = await create();
  await prisma.personalizedRecommendation.update({
    where: { id: second.id },
    data: { cycleKey: first.cycleKey },
  });
  const path = first.id;
  const snapshot = {
    current: second.id,
    drafts: {
      [first.id]: { kind: "BOOLEAN", value: true },
      [second.id]: { kind: "BOOLEAN", value: false },
    },
  };
  assert.deepEqual(await getPracticeAccountDraft(actor, path), {
    snapshot: null,
    revision: 0,
    savedAt: null,
  });
  const evidenceBefore = await prisma.learningEvent.count();
  const saved = await savePracticeAccountDraft(actor, path, {
    ...snapshot,
    expectedRevision: 0,
  });
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.snapshot, snapshot);
  assert.deepEqual(
    await savePracticeAccountDraft(actor, second.id, {
      ...snapshot,
      expectedRevision: 0,
    }),
    saved,
  );
  await assert.rejects(
    getPracticeAccountDraft(other, path),
    ResourceNotFoundError,
  );
  await assert.rejects(
    savePracticeAccountDraft(other, path, { ...snapshot, expectedRevision: 1 }),
    ResourceNotFoundError,
  );
  await assert.rejects(
    savePracticeAccountDraft(actor, path, {
      ...snapshot,
      expectedRevision: 0,
      drafts: {},
    }),
    PracticeDraftConflict,
  );
  assert.equal(await prisma.learningEvent.count(), evidenceBefore);
  await startRecommendation(actor, first.id);
  await submitRecommendationPractice(actor, first.id, {
    idempotencyKey: randomUUID(),
    answers: [{ questionId: question.id, kind: "BOOLEAN", value: true }],
  });
  const onlyUnsubmitted = { [second.id]: snapshot.drafts[second.id] };
  assert.deepEqual(
    (await getPracticeAccountDraft(actor, path)).snapshot?.drafts,
    onlyUnsubmitted,
  );
  const ended = await managePracticeSet(actor, path, {
    action: "END",
    expectedRevision: 0,
  });
  assert.deepEqual(
    (await getPracticeAccountDraft(actor, path)).snapshot?.drafts,
    onlyUnsubmitted,
  );
  await assert.rejects(
    savePracticeAccountDraft(actor, path, { ...snapshot, expectedRevision: 1 }),
    { status: 409 },
  );
  const trashed = await managePracticeSet(actor, path, {
    action: "TRASH",
    expectedRevision: ended.revision,
  });
  const restored = await managePracticeSet(actor, path, {
    action: "RESTORE",
    expectedRevision: trashed.revision,
  });
  assert.deepEqual(
    (await getPracticeAccountDraft(actor, path)).snapshot?.drafts,
    onlyUnsubmitted,
  );
  await prisma.personalizedRecommendation.update({
    where: { id: second.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  assert.deepEqual(
    (await getPracticeAccountDraft(actor, path)).snapshot?.drafts,
    onlyUnsubmitted,
  );
  const trashedAgain = await managePracticeSet(actor, path, {
    action: "TRASH",
    expectedRevision: restored.revision,
  });
  await managePracticeSet(actor, path, {
    action: "PURGE",
    expectedRevision: trashedAgain.revision,
  });
  await assert.rejects(
    getPracticeAccountDraft(actor, path),
    ResourceNotFoundError,
  );
  const row = await prisma.practiceSetManagement.findUniqueOrThrow({
    where: {
      studentId_cycleKey: { studentId: actor.id, cycleKey: first.cycleKey },
    },
  });
  assert.equal(row.draftData, null);
  assert.equal(
    await prisma.recommendationPracticeAnswer.count({
      where: { recommendationId: first.id },
    }),
    1,
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

test("legacy submission preserves ownership errors before acquiring a practice group lock", async () => {
  const { actor, other, question, create } = await setup("submit_ownership");
  const foreign = await create(other.id);
  const answer = {
    idempotencyKey: randomUUID(),
    answers: [{ questionId: question.id, kind: "BOOLEAN", value: true }],
  };
  await assert.rejects(
    () => submitRecommendationPractice(actor, foreign.id, answer),
    AuthorizationError,
  );
  await assert.rejects(
    () => submitRecommendationPractice(actor, randomUUID(), answer),
    ResourceNotFoundError,
  );
  assert.equal(
    await prisma.practiceSetManagement.count({
      where: { studentId: other.id, cycleKey: foreign.cycleKey },
    }),
    0,
  );
  assert.equal(
    await prisma.recommendationPracticeAnswer.count({
      where: { recommendationId: foreign.id },
    }),
    0,
  );
  assert.equal(
    (
      await prisma.personalizedRecommendation.findUniqueOrThrow({
        where: { id: foreign.id },
      })
    ).status,
    "PENDING",
  );
});
