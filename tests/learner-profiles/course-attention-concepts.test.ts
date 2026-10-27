import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CourseAttentionConcepts } from "../../components/courses/course-attention-concepts";

Object.assign(globalThis, { React });

test("需关注知识点只展示前三项并呈现真实掌握度与证据人数", () => {
  const html = renderToStaticMarkup(
    React.createElement(CourseAttentionConcepts, {
      concepts: [0, 25, 45, 55].map((score, index) => ({
        conceptId: `point-${index}`,
        code: `KP-${index}`,
        name: `知识点${index}`,
        averageMastery: score,
        studentCount: 3,
        attentionStudentCount: 2,
      })),
    }),
  );
  assert.equal([...html.matchAll(/<li\b/gu)].length, 3);
  assert.match(html, /需关注知识点/u);
  assert.match(html, /3 名学生可评估 · 2 名低于 60%/u);
  assert.match(html, /aria-valuenow="0"/u);
  assert.match(html, /width:0%/u);
  assert.doesNotMatch(html, /知识点3|<details/u);
});

test("暂无可列入的知识点时保留证据门槛说明并显示空状态", () => {
  const html = renderToStaticMarkup(
    React.createElement(CourseAttentionConcepts, { concepts: [] }),
  );
  assert.match(html, /暂无可展示的需关注知识点/u);
  assert.match(html, /稳定证据门槛/u);
  assert.doesNotMatch(html, /role="progressbar"/u);
});
