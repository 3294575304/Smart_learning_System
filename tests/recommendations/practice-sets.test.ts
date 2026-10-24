import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPracticeSet,
  type PracticeSetRecord,
} from "../../services/practice-sets/grouping";
import {
  practiceSetQuerySchema,
  practiceSetStatus,
} from "../../services/practice-sets/types";
function item(
  id: string,
  status: PracticeSetRecord["status"],
): PracticeSetRecord {
  return {
    id,
    status,
    createdAt: new Date("2026-10-04T12:00:00Z"),
    courseCycle: null,
    conceptSnapshots: [],
    question: {
      title: `题目${id}`,
      type: "SINGLE_CHOICE",
      knowledgePointLinks: [{ knowledgePoint: { name: "循环结构" } }],
    },
  };
}
test("十道历史推荐成为一组，继续入口优先已开始的题目", () => {
  const set = buildPracticeSet(
    Array.from({ length: 10 }, (_, i) =>
      item(String(i), i < 3 ? "COMPLETED" : i === 5 ? "STARTED" : "PENDING"),
    ),
  );
  assert.equal(set.total, 10);
  assert.equal(set.completed, 3);
  assert.equal(set.entryId, "5");
  assert.equal(set.status, "ACTIVE");
  assert.deepEqual(set.knowledgePoints, ["循环结构"]);
  assert.equal(set.courseId, null);
  assert.equal(set.courseName, "通用个性化练习");
});
test("课程分类来自正式关系，测试组保留测试名称", () => {
  const record = item("a", "PENDING");
  record.courseCycle = {
    course: { id: "math", name: "高等数学" },
    requestSnapshot: { mode: "TEST" },
  };
  record.conceptSnapshots = [{ resolvedNode: { name: "极限" } }];
  const set = buildPracticeSet([record]);
  assert.equal(set.courseId, "math");
  assert.equal(set.courseName, "高等数学");
  assert.equal(set.title, "章节综合测试");
  assert.deepEqual(set.knowledgePoints, ["极限"]);
});
test("跳过中间题并完成最后一题不等于整组完成", () => {
  assert.equal(
    practiceSetStatus(["COMPLETED", "PENDING", "COMPLETED"]),
    "ACTIVE",
  );
  assert.equal(practiceSetStatus(["COMPLETED", "COMPLETED"]), "COMPLETED");
  assert.equal(practiceSetStatus(["COMPLETED", "EXPIRED"]), "EXPIRED");
});
test("全部完成可以查看已完成记录，全部失效不被标记完成", () => {
  assert.equal(buildPracticeSet([item("a", "COMPLETED")]).entryId, "a");
  assert.equal(buildPracticeSet([item("a", "DISMISSED")]).status, "EXPIRED");
});
test("分页、状态与额外字段严格校验", () => {
  assert.deepEqual(practiceSetQuerySchema.parse({}), { page: 1 });
  for (const query of [
    { page: 0 },
    { page: 1.5 },
    { status: "STARTED" },
    { studentId: "other" },
    { courseId: "" },
  ])
    assert.equal(practiceSetQuerySchema.safeParse(query).success, false);
  assert.equal(
    practiceSetQuerySchema.parse({
      page: "2",
      courseId: "python",
      status: "ACTIVE",
    }).page,
    2,
  );
});

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PracticeSetCenter } from "../../components/recommendations/practice-set-center";
test("练习中心按组展示题量、进度、课程和继续入口", () => {
  Object.assign(globalThis, { React });
  const set = buildPracticeSet([
    item("a", "COMPLETED"),
    item("b", "STARTED"),
    item("c", "PENDING"),
  ]);
  const markup = renderToStaticMarkup(
    React.createElement(PracticeSetCenter, {
      initialResult: {
        items: [set],
        courses: [{ id: "python", name: "Python 程序设计" }],
        total: 1,
        nextPage: 2,
      },
    }),
  );
  assert.match(markup, /Python 程序设计/);
  assert.match(markup, /共 1 组/);
  assert.match(markup, /已完成 1\/3/);
  assert.match(markup, /\/student\/recommendations\/b\/practice/);
  assert.match(markup, /继续练习/);
  assert.match(markup, /练习组分页/);
  assert.match(markup, /下一页/);
  assert.doesNotMatch(markup, /查看下一页推荐/);
});
