import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeCourseProfiles,
  summarizeCourseChapterMastery,
  summarizeCourseAttentionConcepts,
  type CourseMasteryEntry,
} from "../../services/course-analytics/metrics";
import type { ChapterNode } from "../../services/knowledge-graph/chapter-groups";

test("课程画像汇总只采用每名学生的最新快照和稳定结论", () => {
  const summary = summarizeCourseProfiles(4, [
    {
      studentId: "student-1",
      objectiveMasteryDimension: {
        evidenceState: "CONCLUSIVE",
        conclusiveAverageMastery: 55,
      },
    },
    {
      studentId: "student-1",
      objectiveMasteryDimension: {
        evidenceState: "CONCLUSIVE",
        conclusiveAverageMastery: 90,
      },
    },
    {
      studentId: "student-2",
      objectiveMasteryDimension: {
        evidenceState: "CONCLUSIVE",
        conclusiveAverageMastery: 85,
      },
    },
    {
      studentId: "student-3",
      objectiveMasteryDimension: {
        evidenceState: "INSUFFICIENT_EVIDENCE",
        conclusiveAverageMastery: null,
      },
    },
  ]);

  assert.deepEqual(summary, {
    snapshotCount: 3,
    coverageRate: 75,
    conclusiveCount: 2,
    evidencePendingCount: 2,
    averageMastery: 70,
    attentionStudentCount: 1,
  });
});

function node(id: string, nodeType: string, code = id): ChapterNode {
  return { id, conceptId: `concept-${id}`, code, name: id, nodeType };
}

function entry(
  studentId: string,
  nodeId: string,
  masteryScore: number | null,
  overrides: Partial<CourseMasteryEntry> = {},
): CourseMasteryEntry {
  return {
    studentId,
    conceptId: `concept-${nodeId}`,
    masteryScore,
    evidenceCount: 3,
    evidenceState: "CONCLUSIVE",
    ...overrides,
  };
}

test("章节只汇总正式归属的知识点，先算学生均值并排除章节自身、历史和跨班数据", () => {
  const summary = summarizeCourseChapterMastery(
    ["s1", "s2", "s2"],
    [
      node("chapter", "CHAPTER", "CH-2"),
      node("a", "KNOWLEDGE_POINT", "KP-99"),
      node("b", "KNOWLEDGE_POINT"),
      node("orphan", "KNOWLEDGE_POINT"),
    ],
    [
      { fromNodeId: "chapter", toNodeId: "a" },
      { fromNodeId: "chapter", toNodeId: "a" },
      { fromNodeId: "chapter", toNodeId: "b" },
    ],
    [
      entry("s1", "a", 20),
      entry("s1", "a", 20),
      entry("s1", "b", 80),
      entry("s2", "a", 90),
      entry("s1", "chapter", 0),
      entry("s1", "orphan", 0),
      entry("s1", "historical", 0),
      entry("foreign-student", "a", 0),
    ],
  );
  assert.deepEqual(summary, [
    {
      chapterId: "chapter",
      code: "CH-2",
      name: "chapter",
      conceptCount: 2,
      averageMastery: 70,
      evidenceStudentCount: 2,
      assessedStudentCount: 2,
      stableEntryCount: 3,
      totalEntryCount: 4,
    },
  ]);
});

test("证据不足、无证据和真实零分分别保留，缺失学生和知识点不补零", () => {
  const chapterIds = ["zero", "insufficient", "missing"];
  const summary = summarizeCourseChapterMastery(
    ["s1", "s2"],
    chapterIds.flatMap((id) => [
      node(id, "CHAPTER"),
      node(`${id}-point`, "KNOWLEDGE_POINT"),
    ]),
    chapterIds.map((id) => ({ fromNodeId: id, toNodeId: `${id}-point` })),
    [
      entry("s1", "zero-point", 0),
      entry("s1", "insufficient-point", 0, {
        evidenceCount: 1,
        evidenceState: "INSUFFICIENT_EVIDENCE",
      }),
      entry("s2", "insufficient-point", 100, { evidenceCount: 2 }),
      entry("s1", "missing-point", null, {
        evidenceCount: 0,
        evidenceState: "NO_EVIDENCE",
      }),
    ],
  );
  const zero = summary.find((item) => item.chapterId === "zero");
  const insufficient = summary.find(
    (item) => item.chapterId === "insufficient",
  );
  const missing = summary.find((item) => item.chapterId === "missing");
  assert.equal(zero?.averageMastery, 0);
  assert.equal(zero?.assessedStudentCount, 1);
  assert.equal(zero?.totalEntryCount, 2);
  assert.equal(insufficient?.averageMastery, null);
  assert.equal(insufficient?.evidenceStudentCount, 2);
  assert.equal(insufficient?.stableEntryCount, 0);
  assert.equal(missing?.averageMastery, null);
  assert.equal(missing?.evidenceStudentCount, 0);
  assert.equal(summary[0]?.chapterId, "zero");
});

test("所有章节按掌握度升序，未评估置后，同分按章节编号自然排序", () => {
  const cases = [
    { id: "CH-1", score: 90 },
    { id: "CH-10", score: 50 },
    { id: "CH-2", score: 50 },
    { id: "CH-3", score: 0 },
    { id: "CH-4", score: 70 },
    { id: "CH-5", score: 80 },
    { id: "CH-6", score: null },
  ];
  const summary = summarizeCourseChapterMastery(
    ["s1"],
    cases.flatMap(({ id }) => [
      node(id, "CHAPTER"),
      node(`${id}-point`, "KNOWLEDGE_POINT"),
    ]),
    cases.map(({ id }) => ({ fromNodeId: id, toNodeId: `${id}-point` })),
    cases.flatMap(({ id, score }) =>
      score === null ? [] : [entry("s1", `${id}-point`, score)],
    ),
  );
  assert.deepEqual(
    summary.map((item) => item.chapterId),
    ["CH-3", "CH-2", "CH-10", "CH-4", "CH-5", "CH-1", "CH-6"],
  );
});

test("章节汇总排除无效数值并保留空章节，无正式章节时返回空列表", () => {
  const nodes = [node("chapter", "CHAPTER"), node("empty", "CHAPTER")];
  const invalidScores = [Number.NaN, Number.POSITIVE_INFINITY, -1, 101, null];
  const summary = summarizeCourseChapterMastery(
    ["s1"],
    [
      ...nodes,
      ...invalidScores.map((_, i) => node(`point-${i}`, "KNOWLEDGE_POINT")),
    ],
    invalidScores.map((_, i) => ({
      fromNodeId: "chapter",
      toNodeId: `point-${i}`,
    })),
    invalidScores.map((score, i) => entry("s1", `point-${i}`, score)),
  );
  assert.equal(summary.length, 2);
  assert.ok(summary.every((item) => item.averageMastery === null));
  assert.ok(summary.every((item) => item.assessedStudentCount === 0));
  assert.equal(
    summary.find((item) => item.chapterId === "empty")?.conceptCount,
    0,
  );
  assert.deepEqual(summarizeCourseChapterMastery([], [], [], []), []);
  assert.deepEqual(
    summarizeCourseChapterMastery(
      ["s1"],
      [node("a", "KNOWLEDGE_POINT")],
      [],
      [entry("s1", "a", 80)],
    ),
    [],
  );
});

test("需关注列表只包含当前正式知识点，排除章节、历史、证据不足和平均达标项", () => {
  const points = summarizeCourseAttentionConcepts(
    ["s1", "s2"],
    [
      node("chapter", "CHAPTER"),
      ...["low", "lower", "normal", "insufficient"].map((id) =>
        node(id, "KNOWLEDGE_POINT"),
      ),
    ],
    [
      entry("s1", "chapter", 0),
      entry("s1", "historical", 0),
      entry("foreign-student", "low", 0),
      entry("s1", "low", 20),
      entry("s1", "low", 20),
      entry("s2", "low", 80),
      entry("s1", "lower", 0),
      entry("s2", "lower", 50),
      entry("s1", "normal", 60),
      entry("s1", "insufficient", 0, {
        evidenceState: "INSUFFICIENT_EVIDENCE",
        evidenceCount: 1,
      }),
    ],
  );
  assert.deepEqual(
    points.map((point) => [
      point.conceptId,
      point.averageMastery,
      point.studentCount,
      point.attentionStudentCount,
    ]),
    [
      ["concept-lower", 25, 2, 2],
      ["concept-low", 50, 2, 1],
    ],
  );
});

test("知识点暂无稳定证据或当前范围无人时不生成虚假需关注项", () => {
  const nodes = [node("point", "KNOWLEDGE_POINT")];
  assert.deepEqual(summarizeCourseAttentionConcepts(["s1"], nodes, []), []);
  assert.deepEqual(
    summarizeCourseAttentionConcepts([], nodes, [entry("s1", "point", 0)]),
    [],
  );
});
