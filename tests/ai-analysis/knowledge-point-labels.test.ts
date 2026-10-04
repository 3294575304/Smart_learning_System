import assert from "node:assert/strict";
import test from "node:test";

import {
  knowledgePointLabel,
  localizeKnowledgePointReferences,
} from "../../components/learning-analysis/knowledge-point-labels";

test("学情分析使用题目冻结的中文知识点名称，不展示数据库 ID", () => {
  const labels = { cmsk334kg0001ygesi744d3dk: "Python 程序设计" };
  assert.equal(
    knowledgePointLabel("cmsk334kg0001ygesi744d3dk", labels),
    "Python 程序设计",
  );
  assert.equal(
    localizeKnowledgePointReferences(
      "优先复习知识点 cmsk334kg0001ygesi744d3dk，再完成基础例题。",
      labels,
    ),
    "优先复习知识点 Python 程序设计，再完成基础例题。",
  );
});

test("历史分析找不到名称时使用安全中文占位，不直接泄露内部 ID", () => {
  assert.equal(knowledgePointLabel("legacy-internal-id", {}), "未命名知识点");
});
