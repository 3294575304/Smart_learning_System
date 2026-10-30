import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  practiceManagementSchema,
  practiceManagementBatchSchema,
} from "../../services/practice-sets/management-schemas";
import { practiceSetQuerySchema } from "../../services/practice-sets/types";
import { PracticeManagementActions } from "../../components/recommendations/practice-management-actions";
Object.assign(globalThis, { React });
test("management validates names, revisions and batch limits", () => {
  assert.equal(
    practiceManagementSchema.parse({
      action: "RENAME",
      title: " 标题 ",
      expectedRevision: 0,
    }).action,
    "RENAME",
  );
  for (const title of ["", " ", "a".repeat(81)])
    assert.equal(
      practiceManagementSchema.safeParse({
        action: "RENAME",
        title,
        expectedRevision: 0,
      }).success,
      false,
    );
  assert.equal(
    practiceManagementSchema.safeParse({
      action: "TRASH",
      expectedRevision: -1,
    }).success,
    false,
  );
  assert.equal(
    practiceManagementBatchSchema.safeParse({
      action: "END",
      items: [{ id: "id", expectedRevision: 0 }],
    }).success,
    false,
  );
  assert.equal(
    practiceManagementBatchSchema.safeParse({
      action: "TRASH",
      items: Array.from({ length: 101 }, (_, i) => ({
        id: String(i),
        expectedRevision: 0,
      })),
    }).success,
    false,
  );
});
test("sections and search reject invalid query data", () => {
  assert.equal(practiceSetQuerySchema.parse({ section: "TRASH" }).page, 1);
  assert.equal(
    practiceSetQuerySchema.safeParse({ section: "EVERYONE" }).success,
    false,
  );
  assert.equal(
    practiceSetQuerySchema.safeParse({ keyword: "a".repeat(101) }).success,
    false,
  );
});
test("active menu and trash menu offer the appropriate lifecycle actions", () => {
  const render = (trashed: boolean) =>
    renderToStaticMarkup(
      React.createElement(PracticeManagementActions, {
        id: "id",
        title: "test",
        active: !trashed,
        management: {
          title: null,
          revision: 0,
          endedAt: trashed ? "date" : null,
          trashedAt: trashed ? "date" : null,
        },
        onChange() {},
      }),
    );
  const active = render(false);
  assert.match(active, />重命名</);
  assert.match(active, />结束练习</);
  assert.match(active, />移入回收站</);
  const trash = render(true);
  assert.match(trash, />恢复记录</);
  assert.doesNotMatch(trash, />结束练习<|>重命名</);
});
