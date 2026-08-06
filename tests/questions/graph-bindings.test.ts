import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { QuestionGraphBindingType } from "@prisma/client";

import {
  clearGraphBindingsSchema,
  saveGraphBindingsSchema,
} from "@/services/question-graph-bindings/schemas";

const ids = {
  courseId: "cmecourse000000000000001",
  graphVersionId: "cmegraphv000000000000001",
  concept1: "cmeconcept00000000000001",
  concept2: "cmeconcept00000000000002",
  node1: "cmenode00000000000000001",
  node2: "cmenode00000000000000002",
};

test("题目图谱绑定请求接受一个主知识点和多个不重复次要知识点", () => {
  assert.equal(
    saveGraphBindingsSchema.safeParse({
      courseId: ids.courseId,
      graphVersionId: ids.graphVersionId,
      expectedRevision: 0,
      bindings: [
        {
          conceptId: ids.concept1,
          publishedNodeId: ids.node1,
          type: QuestionGraphBindingType.PRIMARY,
        },
        {
          conceptId: ids.concept2,
          publishedNodeId: ids.node2,
          type: QuestionGraphBindingType.SECONDARY,
        },
      ],
    }).success,
    true,
  );
});

test("题目图谱绑定拒绝多个 PRIMARY 和重复 Concept", () => {
  const duplicate = [
    {
      conceptId: ids.concept1,
      publishedNodeId: ids.node1,
      type: QuestionGraphBindingType.PRIMARY,
    },
    {
      conceptId: ids.concept1,
      publishedNodeId: ids.node2,
      type: QuestionGraphBindingType.PRIMARY,
    },
  ];
  assert.equal(
    saveGraphBindingsSchema.safeParse({
      courseId: ids.courseId,
      graphVersionId: ids.graphVersionId,
      expectedRevision: 0,
      bindings: duplicate,
    }).success,
    false,
  );
});

test("清除绑定必须携带乐观并发修订号", () => {
  assert.equal(
    clearGraphBindingsSchema.safeParse({ courseId: ids.courseId }).success,
    false,
  );
  assert.equal(
    clearGraphBindingsSchema.safeParse({
      courseId: ids.courseId,
      expectedRevision: 2,
    }).success,
    true,
  );
});

test("迁移通过外键、唯一约束和部分索引保护核心绑定规则", async () => {
  const sql = await readFile(
    new URL(
      "../../prisma/migrations/20260806120000_add_question_graph_bindings/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(sql, /questionId_courseId_conceptId_key/u);
  assert.match(sql, /one_primary_per_set_key/u);
  assert.match(sql, /PublishedKnowledgeGraphNode/u);
  assert.match(sql, /ON DELETE RESTRICT/u);
});

test("教师界面包含搜索、主次绑定、版本过期、并发保存和清空确认", async () => {
  const source = await readFile(
    new URL(
      "../../components/questions/question-graph-binding-panel.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  for (const text of [
    "搜索节点名称或编码",
    "主知识点",
    "次要知识点",
    "来源版本已过期",
    "expectedRevision",
    "确认清空",
  ])
    assert.match(source, new RegExp(text, "u"));
});
