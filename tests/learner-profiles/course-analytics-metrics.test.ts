import assert from "node:assert/strict";
import test from "node:test";

import {
  summarizeCourseProfiles,
  summarizeWeakCourseConcepts,
} from "../../services/course-analytics/metrics";

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

test("班级薄弱知识点按平均掌握度和需关注人数排序", () => {
  const concepts = summarizeWeakCourseConcepts([
    {
      conceptId: "concept-a",
      code: "KP-1-1",
      name: "变量",
      masteryScore: 50,
    },
    {
      conceptId: "concept-a",
      code: "KP-1-1",
      name: "变量",
      masteryScore: 70,
    },
    {
      conceptId: "concept-b",
      code: "KP-2-1",
      name: "循环",
      masteryScore: 40,
    },
  ]);

  assert.equal(concepts[0]?.conceptId, "concept-b");
  assert.equal(concepts[0]?.averageMastery, 40);
  assert.equal(concepts[1]?.averageMastery, 60);
  assert.equal(concepts[1]?.attentionStudentCount, 1);
});
