import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";

import { AssignmentScoreTrendChart } from "../../components/courses/teacher-course-analytics";

Object.assign(globalThis, { React });

test("作业趋势 SVG 标题在服务端保留完整文本并安全转义，不产生 title 多子节点警告", (t) => {
  const warnings: string[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  });
  const html = renderToString(
    React.createElement(AssignmentScoreTrendChart, {
      points: [
        {
          assignmentId: "assignment-1",
          title: "编程题判题演示",
          date: new Date("2026-10-27T08:00:00Z"),
          averageScore: 80,
          finalizedStudentCount: 1,
          eligibleStudentCount: 96,
        },
        {
          assignmentId: "assignment-2",
          title: "循环 <练习> & 复习",
          date: new Date("2026-10-28T08:00:00Z"),
          averageScore: 70.5,
          finalizedStudentCount: 3,
          eligibleStudentCount: 96,
        },
      ],
    }),
  );
  const titles = [...html.matchAll(/<title>([\s\S]*?)<\/title>/gu)].map(
    (match) => match[1],
  );
  assert.deepEqual(titles, [
    "编程题判题演示：百分制平均分 80 分，最终评分 1/96 名有效学生",
    "循环 &lt;练习&gt; &amp; 复习：百分制平均分 70.5 分，最终评分 3/96 名有效学生",
  ]);
  assert.match(html, /<svg[\s\S]*<g><title>/u);
  assert.deepEqual(warnings, []);
});
