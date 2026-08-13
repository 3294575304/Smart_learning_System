import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { QuestionType } from "@prisma/client";

import { courseRecommendationGenerationSchema } from "@/services/course-recommendations/schemas";
import { courseRecommendationPolicySchema } from "@/services/course-recommendations/schemas";
import { structureSelfReflection } from "@/services/self-reflections/ai";
import { selfReflectionOutputSchema } from "@/services/self-reflections/schemas";

test("课程自主练习支持 Python 题型且仍限制题量和难度", () => {
  const parsed = courseRecommendationGenerationSchema.parse({
    classroomId: "classroom-1",
    conceptIds: ["concept-1"],
    questionTypes: [QuestionType.PYTHON_PROGRAMMING],
    count: 20,
    difficulty: 5,
  });
  assert.deepEqual(parsed.questionTypes, [QuestionType.PYTHON_PROGRAMMING]);
  assert.equal(parsed.count, 20);
});

test("教师推荐策略要求六项权重合计 100%", () => {
  const base = {
    expectedRevision: 0,
    weaknessWeight: 35,
    prerequisiteWeight: 20,
    difficultyWeight: 15,
    errorPatternWeight: 10,
    freshnessWeight: 10,
    teacherPriorityWeight: 10,
    recentWindowDays: 14,
    difficultyTolerance: 1,
    maxQuestionCount: 20,
  };
  assert.equal(courseRecommendationPolicySchema.safeParse(base).success, true);
  assert.equal(
    courseRecommendationPolicySchema.safeParse({
      ...base,
      teacherPriorityWeight: 11,
    }).success,
    false,
  );
});

test("AI 自述严格限制课程 Concept ID 并在越界时规则降级", async () => {
  const result = await structureSelfReflection(
    {
      name: "bad-provider",
      model: "bad-model",
      analyzeStudentPerformance: async () => ({}),
      parseSyllabus: async () => ({}),
      structureSelfReflection: async () => ({
        summary: "循环困难",
        goals: [],
        difficulties: ["循环"],
        learningHabits: [],
        practiceRequest: {
          conceptIds: ["outside"],
          questionTypes: [],
          count: 5,
          difficulty: 2,
        },
      }),
    },
    {
      anonymousStudentId: "a".repeat(64),
      text: "循环困难",
      concepts: [{ id: "concept-1", code: "LOOP", name: "循环" }],
    },
  );
  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.output.practiceRequest?.conceptIds, ["concept-1"]);
  assert.doesNotThrow(() => selfReflectionOutputSchema.parse(result.output));
});

test("迭代六 migration 只做增量扩展并约束 Attempt 来源二选一", async () => {
  const sql = await readFile(
    "prisma/migrations/20260812150000_finish_iteration_six/migration.sql",
    "utf8",
  );
  assert.match(sql, /ProgrammingAttempt_exactly_one_source_check/u);
  assert.match(
    sql,
    /num_nonnulls\("studentAnswerId", "assignmentQuestionId", "configSnapshotId"\) = 3/u,
  );
  assert.match(sql, /CREATE TABLE "StudentSelfReflection"/u);
  assert.match(
    sql,
    /ALTER TABLE "RecommendationPracticeAnswer"[\s\S]+ADD COLUMN "assessmentRevisionKey" VARCHAR\(191\)/u,
  );
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/u);
});
