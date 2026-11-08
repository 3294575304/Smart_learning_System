import assert from "node:assert/strict";
import { test } from "node:test";
import {
  kr20,
  percent,
  scoreStats,
} from "@/services/exams/analysis-statistics";
import { buildExamAnalysisXlsx } from "@/services/exams/analysis-xlsx";
import type { ExamAnalysisSnapshot } from "@/services/exams/analysis";

test("exam score metrics distinguish no scores from zero scores", () => {
  assert.equal(percent(0, 0), null);
  const empty = scoreStats([], { pass: 60, excellent: 85 });
  assert.equal(empty.average, null);
  assert.deepEqual(empty.bands, [0, 0, 0, 0, 0]);
  const result = scoreStats([0, 60, 85, 100], { pass: 60, excellent: 85 });
  assert.equal(result.average, 61.3);
  assert.equal(result.median, 72.5);
  assert.equal(result.passRate, 75);
  assert.equal(result.excellentRate, 50);
  assert.deepEqual(result.bands, [1, 1, 0, 1, 1]);
});

test("KR-20 requires complete binary data and enough objective items", () => {
  assert.equal(
    kr20([
      [1, 0],
      [0, 1],
    ]),
    null,
  );
  assert.equal(
    kr20([
      [1, 0, 1, 0, 1, 0, 1, 0, 1, -1],
      [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    ]),
    null,
  );
  assert.equal(
    typeof kr20([[...Array(10).fill(1)], [...Array(10).fill(0)]]),
    "number",
  );
});

test("exam export has three readable worksheets without student identities", () => {
  const empty = scoreStats([], { pass: 60, excellent: 85 });
  const snapshot: ExamAnalysisSnapshot = {
    examId: "exam",
    title: "期中考试",
    courseId: "course",
    type: "MIDTERM",
    thresholds: { pass: 60, excellent: 85 },
    overview: {
      ...empty,
      expected: 0,
      participated: 0,
      participationRate: null,
      special: 0,
      unscored: 0,
      publishedClassrooms: 0,
      totalClassrooms: 1,
      kr20: null,
    },
    classrooms: [],
    questions: [],
    concepts: [],
    objectives: [],
    unmappedQuestions: 0,
  };
  const buffer = buildExamAnalysisXlsx(snapshot);
  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.ok(buffer.includes(Buffer.from("xl/worksheets/sheet3.xml")));
});
