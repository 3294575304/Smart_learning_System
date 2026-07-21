import assert from "node:assert/strict";
import test from "node:test";

import {
  MembershipStatus,
  QuestionType,
  RecommendationSource,
  RecommendationStatus,
  SubmissionStatus,
} from "@prisma/client";

import type { RecommendationExplanationProvider } from "../../../services/ai/recommender";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "../../../services/auth/policy";
import {
  createOrGetPersonalizedRecommendations,
  createPersonalizedRecommendations,
} from "../../../services/recommendations/service";
import { integrationPrisma } from "./database";
import { RecommendationTestFactory } from "./factories";

const now = new Date("2026-07-21T08:00:00.000Z");

async function base(factory: RecommendationTestFactory) {
  const [teacher, student] = await Promise.all([
    factory.teacher(),
    factory.student(),
  ]);
  const classroom = await factory.classroom(teacher.id);
  await factory.membership(classroom.id, student.id);
  return { teacher, student, classroom };
}

function generationInput(studentId: string, classroomId: string, limit = 10) {
  return {
    studentId,
    classroomId,
    recommendedDifficulty: 3,
    limit,
  };
}

test("real PostgreSQL prioritizes questions for the weakest knowledge point", async (t) => {
  const factory = new RecommendationTestFactory("weakness");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  const [weak, strong] = await Promise.all([
    factory.knowledgePoint(teacher.id, { name: "Weak" }),
    factory.knowledgePoint(teacher.id, { name: "Strong" }),
  ]);
  await Promise.all([
    factory.mastery({
      studentId: student.id,
      knowledgePointId: weak.id,
      masteryScore: 20,
    }),
    factory.mastery({
      studentId: student.id,
      knowledgePointId: strong.id,
      masteryScore: 90,
    }),
  ]);
  const weakQuestion = await factory.question(teacher.id, {
    knowledgePointIds: [weak.id],
  });
  await factory.question(teacher.id, { knowledgePointIds: [strong.id] });

  const result = await createOrGetPersonalizedRecommendations(
    factory.actor(student),
    generationInput(student.id, classroom.id, 1),
    { now },
  );

  assert.equal(result.items[0].questionId, weakQuestion.id);
});

test("recent valid answers are excluded while answers outside the latest 100 and withdrawn answers remain eligible", async (t) => {
  const factory = new RecommendationTestFactory("recent_answers");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  const recent = await factory.question(teacher.id);
  const old = await factory.question(teacher.id);
  const withdrawn = await factory.question(teacher.id);
  const fillers = await Promise.all(
    Array.from({ length: 99 }, () =>
      factory.question(teacher.id, { difficulty: 5 }),
    ),
  );
  await factory.answers({
    teacherId: teacher.id,
    classroomId: classroom.id,
    studentId: student.id,
    seeds: [
      {
        question: recent,
        isCorrect: true,
        gradedAt: new Date("2026-07-21T07:59:00.000Z"),
      },
      ...fillers.map((question, index) => ({
        question,
        isCorrect: index % 2 === 0,
        gradedAt: new Date(now.getTime() - (index + 2) * 1_000),
      })),
      {
        question: old,
        isCorrect: false,
        gradedAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
  });
  await factory.answers({
    teacherId: teacher.id,
    classroomId: classroom.id,
    studentId: student.id,
    status: SubmissionStatus.WITHDRAWN,
    seeds: [{ question: withdrawn, isCorrect: false, gradedAt: now }],
  });

  const result = await createOrGetPersonalizedRecommendations(
    factory.actor(student),
    generationInput(student.id, classroom.id, 2),
    { now },
  );
  const ids = new Set(result.items.map((item) => item.questionId));
  assert.equal(ids.has(recent.id), false);
  assert.equal(ids.has(old.id), true);
  assert.equal(ids.has(withdrawn.id), true);
});

test("only unexpired PENDING and STARTED recommendations block a new cycle", async (t) => {
  const factory = new RecommendationTestFactory("active_states");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  const [pending, started, expired, completed] = await Promise.all(
    Array.from({ length: 4 }, () => factory.question(teacher.id)),
  );
  await Promise.all([
    factory.recommendation({ studentId: student.id, questionId: pending.id }),
    factory.recommendation({
      studentId: student.id,
      questionId: started.id,
      status: RecommendationStatus.STARTED,
    }),
    factory.recommendation({
      studentId: student.id,
      questionId: expired.id,
      expiresAt: new Date("2026-07-20T00:00:00.000Z"),
    }),
    factory.recommendation({
      studentId: student.id,
      questionId: completed.id,
      status: RecommendationStatus.COMPLETED,
    }),
  ]);

  const result = await createOrGetPersonalizedRecommendations(
    factory.actor(student),
    generationInput(student.id, classroom.id, 4),
    { now },
  );
  const ids = new Set(result.items.map((item) => item.questionId));
  assert.equal(ids.has(pending.id), false);
  assert.equal(ids.has(started.id), false);
  assert.equal(ids.has(expired.id), true);
  assert.equal(ids.has(completed.id), true);
});

test("answer streaks raise, lower, or preserve recommendation difficulty by business behavior", async (t) => {
  for (const scenario of ["correct", "wrong", "normal"] as const) {
    await t.test(scenario, async () => {
      const factory = new RecommendationTestFactory(`difficulty_${scenario}`);
      try {
        const { teacher, student, classroom } = await base(factory);
        const history = await Promise.all(
          Array.from({ length: scenario === "normal" ? 2 : 4 }, () =>
            factory.question(teacher.id, { difficulty: 5 }),
          ),
        );
        await factory.answers({
          teacherId: teacher.id,
          classroomId: classroom.id,
          studentId: student.id,
          seeds: history.map((question, index) => ({
            question,
            isCorrect:
              scenario === "correct"
                ? true
                : scenario === "wrong"
                  ? false
                  : index === 0,
            gradedAt: new Date(now.getTime() - index * 1_000),
          })),
        });
        await Promise.all([
          factory.question(teacher.id, { difficulty: 2 }),
          factory.question(teacher.id, { difficulty: 3 }),
          factory.question(teacher.id, {
            difficulty: 3,
            type: QuestionType.TRUE_FALSE,
          }),
          factory.question(teacher.id, { difficulty: 4 }),
          factory.question(teacher.id, {
            difficulty: 4,
            type: QuestionType.FILL_BLANK,
          }),
        ]);
        const count = scenario === "normal" ? 1 : scenario === "wrong" ? 2 : 5;
        const result = await createOrGetPersonalizedRecommendations(
          factory.actor(student),
          generationInput(student.id, classroom.id, count),
          { now },
        );
        if (scenario === "correct") {
          assert.ok(result.items.some((item) => item.difficulty === 4));
        } else if (scenario === "wrong") {
          assert.equal(result.items[0].difficulty, 2);
        } else {
          assert.equal(result.items[0].difficulty, 3);
        }
      } finally {
        await factory.cleanup();
      }
    });
  }
});

test("selection uses multiple question types when the database candidate pool permits it", async (t) => {
  const factory = new RecommendationTestFactory("type_diversity");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  await Promise.all([
    factory.question(teacher.id),
    factory.question(teacher.id),
    factory.question(teacher.id, { type: QuestionType.FILL_BLANK }),
  ]);
  const result = await createOrGetPersonalizedRecommendations(
    factory.actor(student),
    generationInput(student.id, classroom.id, 2),
    { now },
  );
  assert.equal(new Set(result.items.map((item) => item.type)).size, 2);
});

test("same student, question, and cycle remain unique across repeated and concurrent calls", async (t) => {
  const factory = new RecommendationTestFactory("concurrency");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  await Promise.all(
    Array.from({ length: 10 }, () => factory.question(teacher.id)),
  );
  const actor = factory.actor(student);
  const input = generationInput(student.id, classroom.id, 10);
  const [first, second] = await Promise.all([
    createOrGetPersonalizedRecommendations(actor, input, { now }),
    createOrGetPersonalizedRecommendations(actor, input, { now }),
  ]);
  const repeated = await createOrGetPersonalizedRecommendations(actor, input, {
    now,
  });
  assert.equal(first.cycleKey, second.cycleKey);
  assert.equal(second.cycleKey, repeated.cycleKey);
  assert.equal(first.items.length, 10);
  assert.equal(second.items.length, 10);
  assert.equal(
    await integrationPrisma.personalizedRecommendation.count({
      where: { studentId: student.id, cycleKey: first.cycleKey },
    }),
    10,
  );
  const duplicateGroups =
    await integrationPrisma.personalizedRecommendation.groupBy({
      by: ["studentId", "questionId", "cycleKey"],
      where: { studentId: student.id },
      _count: { _all: true },
      having: { studentId: { _count: { gt: 1 } } },
    });
  assert.equal(duplicateGroups.length, 0);
});

test("real classroom relations enforce student, teacher, exited-member, and admin isolation", async (t) => {
  const factory = new RecommendationTestFactory("permissions");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  const [otherTeacher, outsider, admin, exited] = await Promise.all([
    factory.teacher(),
    factory.student(),
    factory.admin(),
    factory.student(),
  ]);
  await factory.membership(classroom.id, exited.id, MembershipStatus.LEFT);
  await factory.question(teacher.id);
  const input = generationInput(student.id, classroom.id, 1);
  assert.equal(
    (
      await createOrGetPersonalizedRecommendations(
        factory.actor(teacher),
        input,
        { now },
      )
    ).items.length,
    1,
  );
  await assert.rejects(
    createOrGetPersonalizedRecommendations(factory.actor(otherTeacher), input, {
      now,
    }),
    ResourceNotFoundError,
  );
  await assert.rejects(
    createOrGetPersonalizedRecommendations(factory.actor(outsider), input, {
      now,
    }),
    ResourceNotFoundError,
  );
  await assert.rejects(
    createOrGetPersonalizedRecommendations(
      factory.actor(exited),
      generationInput(exited.id, classroom.id, 1),
      { now },
    ),
    ResourceNotFoundError,
  );
  await assert.rejects(
    createOrGetPersonalizedRecommendations(factory.actor(admin), input, {
      now,
    }),
    AuthorizationError,
  );
});

test("AI retries invalid IDs, changes reasons only, and falls back to rules on provider errors", async (t) => {
  const factory = new RecommendationTestFactory("ai_fallback");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  const point = await factory.knowledgePoint(teacher.id);
  await factory.mastery({
    studentId: student.id,
    knowledgePointId: point.id,
    masteryScore: 25,
  });
  await factory.analysisWithErrorType({
    requestedById: teacher.id,
    studentId: student.id,
    knowledgePointId: point.id,
    errorType: "CONCEPT",
  });
  await Promise.all([
    factory.question(teacher.id, { knowledgePointIds: [point.id] }),
    factory.question(teacher.id, {
      knowledgePointIds: [point.id],
      type: QuestionType.FILL_BLANK,
    }),
  ]);
  let attempts = 0;
  const retryingProvider: RecommendationExplanationProvider = {
    async generateRecommendationReasons(input) {
      attempts += 1;
      if (attempts === 1)
        return { items: [{ questionId: "invalid-id", reason: "Invalid" }] };
      return {
        items: input.items.map((item) => ({
          questionId: item.questionId,
          reason: `AI:${item.questionId}`,
        })),
      };
    },
  };
  const request = {
    studentId: student.id,
    classroomId: classroom.id,
    recommendedDifficulty: 3,
    count: 2,
    teacherScope: {
      candidateQuestionIds: (
        await integrationPrisma.question.findMany({
          where: { creatorId: teacher.id },
          select: { id: true },
        })
      ).map((item) => item.id),
      knowledgePointIds: [],
      types: [],
      tags: [],
    },
  };
  const enhanced = await createPersonalizedRecommendations(
    factory.actor(student),
    request,
    {
      now,
      explanationProvider: retryingProvider,
      aiTimeoutMs: 1_000,
    },
  );
  const selectedIds = enhanced.items.map((item) => item.questionId);
  assert.equal(attempts, 2);
  assert.equal(enhanced.source, RecommendationSource.HYBRID);
  assert.ok(
    enhanced.items.every((item) => item.reason === `AI:${item.questionId}`),
  );

  const failingProvider: RecommendationExplanationProvider = {
    async generateRecommendationReasons() {
      throw new Error("provider unavailable");
    },
  };
  const fallback = await createPersonalizedRecommendations(
    factory.actor(student),
    request,
    {
      now,
      explanationProvider: failingProvider,
      aiTimeoutMs: 1_000,
    },
  );
  assert.equal(fallback.source, RecommendationSource.RULE);
  assert.deepEqual(
    fallback.items.map((item) => item.questionId),
    selectedIds,
  );
  assert.ok(fallback.items.every((item) => !item.reason.startsWith("AI:")));
});

test("server-owned candidate scope is deterministically capped at 1000 rows", async (t) => {
  const factory = new RecommendationTestFactory("candidate_cap");
  t.after(() => factory.cleanup());
  const { teacher, student, classroom } = await base(factory);
  await factory.bulkQuestions(teacher.id, 1_005);
  const result = await createOrGetPersonalizedRecommendations(
    factory.actor(student),
    generationInput(student.id, classroom.id, 1),
    { now },
  );
  assert.equal(result.items.length, 1);
});

test.after(async () => {
  await integrationPrisma.$disconnect();
});
