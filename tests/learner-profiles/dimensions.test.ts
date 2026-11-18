import assert from "node:assert/strict";
import test from "node:test";

import { LearnerProfileEvidenceState, LearningEventType } from "@prisma/client";

import {
  buildActivityDimension,
  buildProgrammingDimension,
  buildReflectionDimension,
} from "../../services/learner-profiles/dimensions";

const now = new Date("2026-11-17T12:00:00.000Z");

function daysAgo(days: number) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

test("activity only counts graded events inside the window", () => {
  const dimension = buildActivityDimension({
    now,
    events: [
      {
        id: "a",
        eventType: LearningEventType.ASSESSMENT_GRADED,
        occurredAt: daysAgo(1),
      },
      {
        id: "b",
        eventType: LearningEventType.ASSESSMENT_GRADED,
        occurredAt: daysAgo(1),
      },
      {
        id: "c",
        eventType: LearningEventType.RECOMMENDATION_PRACTICE_GRADED,
        occurredAt: daysAgo(20),
      },
    ],
  });
  assert.equal(dimension.gradedEventCount, 2);
  assert.equal(dimension.assignmentEventCount, 2);
  assert.equal(dimension.practiceEventCount, 0);
  assert.equal(dimension.activeDays, 1);
  assert.equal(
    dimension.evidenceState,
    LearnerProfileEvidenceState.INSUFFICIENT_EVIDENCE,
  );
  assert.equal(dimension.lastActiveAt, daysAgo(1).toISOString());

  const empty = buildActivityDimension({ now, events: [] });
  assert.equal(empty.evidenceState, LearnerProfileEvidenceState.NO_EVIDENCE);
  assert.equal(empty.conclusion, null);
});

test("reflection is a subjective dimension and does not need three records", () => {
  const none = buildReflectionDimension({ confirmedCount: 0, latest: null });
  assert.equal(none.evidenceState, LearnerProfileEvidenceState.NO_EVIDENCE);
  assert.equal(none.conclusion, null);

  const one = buildReflectionDimension({
    confirmedCount: 1,
    latest: {
      id: "r1",
      confirmedAt: daysAgo(2),
      updatedAt: daysAgo(2),
      inputText: "我觉得循环还是不太熟，想多做几道题。",
      summary: "学生自述循环不熟。",
      goals: ["掌握循环"],
      difficulties: ["嵌套循环", "边界条件", "其他"],
    },
  });
  assert.equal(one.evidenceState, LearnerProfileEvidenceState.CONCLUSIVE);
  assert.equal(one.subjective, true);
  assert.deepEqual(one.topics, ["掌握循环", "嵌套循环", "边界条件"]);
  assert.match(one.conclusion ?? "", /掌握循环/u);
  assert.ok((one.latestWordCount ?? 0) > 0);
});

test("programming dimension only reports aggregate judge results", () => {
  const dimension = buildProgrammingDimension({
    total: 6,
    attempts: [
      {
        id: "p1",
        score: 100,
        maxScore: 100,
        completedAt: daysAgo(1),
        createdAt: daysAgo(1),
      },
      {
        id: "p2",
        score: 40,
        maxScore: 100,
        completedAt: daysAgo(2),
        createdAt: daysAgo(2),
      },
    ],
  });
  assert.equal(dimension.attemptCount, 6);
  assert.equal(dimension.sampledCount, 2);
  assert.equal(dimension.passedCount, 1);
  assert.equal(dimension.passRate, 50);
  assert.equal(dimension.evidenceState, LearnerProfileEvidenceState.CONCLUSIVE);
});
