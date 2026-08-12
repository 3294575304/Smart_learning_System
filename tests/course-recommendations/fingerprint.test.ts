import assert from "node:assert/strict";
import test from "node:test";

import { courseRecommendationFingerprint } from "../../services/course-recommendations/fingerprint";

test("course recommendation fingerprints are stable for object key order", () => {
  assert.equal(
    courseRecommendationFingerprint({ courseId: "course-1", difficulty: 3 }),
    courseRecommendationFingerprint({ difficulty: 3, courseId: "course-1" }),
  );
});

test("course recommendation fingerprints preserve array order selected by callers", () => {
  assert.notEqual(
    courseRecommendationFingerprint({ conceptIds: ["a", "b"] }),
    courseRecommendationFingerprint({ conceptIds: ["b", "a"] }),
  );
});
