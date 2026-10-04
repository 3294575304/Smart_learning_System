import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StudentGradeTabs } from "../../components/grades/student-grade-tabs";

test("成绩切换用清晰链接并且当前成绩类型唯一标记", () => {
  for (const [activeView, href, activeLabel, inactiveLabel] of [
    ["assignments", "/student/results", "作业成绩", "课程总评"],
    ["course", "/student/results?view=course", "课程总评", "作业成绩"],
  ] as const) {
    const markup = renderToStaticMarkup(
      React.createElement(StudentGradeTabs, { activeView }),
    );
    assert.match(markup, /aria-label="成绩类型"/u);
    assert.ok(markup.includes(`href="${href}"`));
    assert.equal((markup.match(/aria-current="page"/gu) ?? []).length, 1);
    assert.match(
      markup,
      new RegExp(`<a aria-current="page"[^>]*>${activeLabel}</a>`, "u"),
    );
    assert.ok(markup.includes(inactiveLabel));
  }
});
