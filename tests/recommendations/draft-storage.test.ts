import assert from "node:assert/strict";
import test from "node:test";
import { parsePracticeDraft } from "../../services/practice-sets/draft-storage";

test("草稿恢复过滤已提交和其他练习题，保留 false 与提交幂等键", () => {
  const key = "5f84d2ef-4c28-4192-a996-f9efb0130380";
  const result = parsePracticeDraft(
    {
      at: 1000,
      current: "done",
      drafts: {
        pending: { kind: "BOOLEAN", value: false },
        done: { kind: "TEXT", value: "old" },
      },
      keys: { pending: key, done: key },
    },
    ["pending"],
    2000,
  );
  assert.deepEqual(result?.drafts, {
    pending: { kind: "BOOLEAN", value: false },
  });
  assert.deepEqual(result?.keys, { pending: key });
  assert.equal(result?.current, "pending");
});
test("过期、未来时间、非法答案均不恢复", () => {
  const base = { at: 1000, current: "q", drafts: {}, keys: {} };
  assert.equal(parsePracticeDraft(base, ["q"], 1000 + 86400001), null);
  assert.equal(parsePracticeDraft(base, ["q"], 999), null);
  assert.equal(
    parsePracticeDraft(
      { ...base, drafts: { q: { kind: "BOOLEAN", value: "false" } } },
      ["q"],
      2000,
    ),
    null,
  );
});
