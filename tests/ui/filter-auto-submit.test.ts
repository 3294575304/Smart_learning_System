import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("筛选选择项立即生效且服务端页面不直接绑定事件", async () => {
  const [control, assignments, results, notifications] = await Promise.all([
    readFile(
      new URL(
        "../../components/filters/auto-submit-select.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/teacher/assignments/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../app/(protected)/teacher/results/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../../components/notifications/notification-center.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  assert.match(control, /form\?\.requestSubmit\(\)/u);
  assert.equal(assignments.match(/<AutoSubmitSelect/gu)?.length, 3);
  assert.equal(results.match(/<AutoSubmitSelect/gu)?.length, 1);
  assert.doesNotMatch(assignments, /onChange=|应用筛选/u);
  assert.doesNotMatch(results, /onChange=|>\s*筛选\s*</u);
  assert.match(assignments, /xl:grid-cols-\[minmax\(20rem,2fr\).*_auto\]/u);
  assert.match(assignments, /xl:items-end/u);
  assert.match(assignments, /RotateCcw/u);
  assert.doesNotMatch(assignments, /xl:col-start-5/u);
  assert.match(notifications, /applyFilter\("status"/u);
  assert.match(notifications, /applyFilter\("type"/u);
  assert.match(notifications, /applyFilter\(\s*"priority"/u);
  assert.doesNotMatch(notifications, /应用筛选/u);
});
