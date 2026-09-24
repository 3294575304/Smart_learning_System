import assert from "node:assert/strict";
import test from "node:test";
import { planKnowledgePointBindingChange } from "@/components/courses/knowledge-point-binding-change";
import { graphConceptQuestionsQuerySchema } from "@/services/question-graph-bindings/schemas";
import type {
  GraphQuestionPoint,
  QuestionGraphBindingState,
} from "@/services/question-graph-bindings/types";

const courseId = "cmecourse000000000000001";
const versionId = "cmegraphv000000000000001";
const point: GraphQuestionPoint = {
  conceptId: "cmeconcept00000000000002",
  conceptKey: "kp2",
  publishedNodeId: "cmenode00000000000000002",
  name: "循环结构",
  code: "KP-2",
  questionCount: 0,
};
const initial: QuestionGraphBindingState = {
  revision: 4,
  sourceVersionId: versionId,
  sourceVersionNumber: 1,
  currentVersionId: versionId,
  sourceVersionStatus: "CURRENT",
  needsReview: false,
  bindings: [
    {
      id: "cmebinding00000000000001",
      conceptId: "cmeconcept00000000000001",
      type: "PRIMARY",
      sourceGraphVersionId: versionId,
      sourceGraphVersionNumber: 1,
      sourceNodeId: "cmenode00000000000000001",
      sourceNode: {
        name: "变量",
        code: "KP-1",
        nodeType: "KNOWLEDGE_POINT",
        sourceRefs: [],
        sourcePath: null,
      },
      currentNode: {
        id: "cmenode00000000000000001",
        conceptId: "cmeconcept00000000000001",
        name: "变量",
        code: "KP-1",
      },
      status: "CURRENT",
    },
  ],
};
test("从知识点添加次要关联时保留原主要关联并携带所见修订号", () => {
  const input = planKnowledgePointBindingChange(
    initial,
    courseId,
    versionId,
    point,
    "SECONDARY",
  );
  assert.equal(input.expectedRevision, 4);
  assert.deepEqual(
    input.bindings.map((item) => [item.conceptId, item.type]),
    [
      [initial.bindings[0]?.conceptId, "PRIMARY"],
      [point.conceptId, "SECONDARY"],
    ],
  );
  assert.equal(initial.bindings.length, 1);
});
test("教师选择新的主要知识点时将原主要关联保留为次要", () => {
  const input = planKnowledgePointBindingChange(
    initial,
    courseId,
    versionId,
    point,
    "PRIMARY",
  );
  assert.deepEqual(
    input.bindings.map((item) => item.type),
    ["SECONDARY", "PRIMARY"],
  );
});
test("移除指定知识点不清空其他关联", () => {
  const input = planKnowledgePointBindingChange(
    initial,
    courseId,
    versionId,
    point,
    null,
  );
  assert.equal(input.bindings.length, 1);
  assert.equal(input.bindings[0]?.conceptId, initial.bindings[0]?.conceptId);
});
test("同一知识点重复保存不重复添加", () => {
  const first = initial.bindings[0];
  assert.ok(first);
  const input = planKnowledgePointBindingChange(
    initial,
    courseId,
    versionId,
    {
      ...point,
      conceptId: first.conceptId,
      publishedNodeId: first.sourceNodeId,
    },
    "PRIMARY",
  );
  assert.equal(input.bindings.length, 1);
});
test("图谱版本改变或历史知识点缺失时阻止覆盖其他绑定", () => {
  assert.throws(
    () =>
      planKnowledgePointBindingChange(
        initial,
        courseId,
        "cmegraphv000000000000002",
        point,
        "SECONDARY",
      ),
    /正式图谱已更新/u,
  );
  assert.throws(
    () =>
      planKnowledgePointBindingChange(
        {
          ...initial,
          bindings: initial.bindings.map((binding) => ({
            ...binding,
            currentNode: null,
          })),
        },
        courseId,
        versionId,
        point,
        "SECONDARY",
      ),
    /审核原有关联/u,
  );
});
test("题目查询要求正式版本并限制分页和关键词长度", () => {
  assert.equal(graphConceptQuestionsQuerySchema.safeParse({}).success, false);
  for (const input of [
    { page: 0 },
    { pageSize: 1000 },
    { keyword: "a".repeat(121) },
    { mode: "OTHER" },
  ])
    assert.equal(
      graphConceptQuestionsQuerySchema.safeParse({
        graphVersionId: versionId,
        ...input,
      }).success,
      false,
    );
  assert.equal(
    graphConceptQuestionsQuerySchema.safeParse({ graphVersionId: versionId })
      .success,
    true,
  );
});
