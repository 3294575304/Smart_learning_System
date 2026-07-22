import assert from "node:assert/strict";
import test from "node:test";

import { formatUnreadBadge } from "../../components/notifications/presenters";

test("导航未读徽标隐藏零值并把大数量限制为 99+", () => {
  assert.equal(formatUnreadBadge(0), null);
  assert.equal(formatUnreadBadge(-5), null);
  assert.equal(formatUnreadBadge(3), "3");
  assert.equal(formatUnreadBadge(99), "99");
  assert.equal(formatUnreadBadge(100), "99+");
});
