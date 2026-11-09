import assert from "node:assert/strict";
import { test } from "node:test";

import { prepareCourseRecommendationFocus } from "@/services/course-recommendations/reason-focus";

test("推荐理由只接受当前题目已具备的证据，每题最多一个建议", () => {
  const { input, apply } = prepareCourseRecommendationFocus([
    {
      id: "first-question-id",
      reason: "先前证据不足。",
      reasonCodes: ["COURSE_SCOPE", "DIAGNOSTIC_EVIDENCE"],
      question: { type: "TRUE_FALSE" },
    },
    {
      id: "second-question-id",
      reason: "这道题适合巩固。",
      reasonCodes: ["LOW_MASTERY", "CORE_CONCEPT"],
      question: { type: "SINGLE_CHOICE" },
    },
  ]);
  assert.deepEqual(input, {
    items: [
      { key: 1, type: "TRUE_FALSE", focuses: ["DIAGNOSTIC_EVIDENCE"] },
      {
        key: 2,
        type: "SINGLE_CHOICE",
        focuses: ["LOW_MASTERY", "CORE_CONCEPT"],
      },
    ],
  });
  const accepted = apply({
    items: [
      { key: 2, focus: "CORE_CONCEPT" },
      { key: 3, focus: "CORE_CONCEPT" },
      { key: 1, focus: "LOW_MASTERY" },
    ],
  });
  assert.deepEqual([...accepted.keys()], ["second-question-id"]);
  assert.match(
    accepted.get("second-question-id") ?? "",
    /^这道题适合巩固。.*核心概念/u,
  );
  assert.equal(
    apply({
      items: [
        { key: 2, focus: "CORE_CONCEPT" },
        { key: 2, focus: "LOW_MASTERY" },
      ],
    }).size,
    0,
  );
  assert.equal(
    apply({
      items: [{ key: 1, focus: "DIAGNOSTIC_EVIDENCE", reason: "任意模型文字" }],
    }).size,
    0,
  );
});
