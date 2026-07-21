import assert from "node:assert/strict";
import test from "node:test";

import { recommendationErrorLog } from "../../lib/recommendation-api";

test("recommendation error logs omit messages, stacks, and connection details", () => {
  const error = Object.assign(
    new Error("password=secret postgresql://admin:secret@production/db"),
    { code: "P2024" },
  );

  assert.deepEqual(recommendationErrorLog(error), {
    name: "Error",
    code: "P2024",
  });
  assert.doesNotMatch(JSON.stringify(recommendationErrorLog(error)), /secret/u);
});
