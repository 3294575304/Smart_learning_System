import assert from "node:assert/strict";
import test from "node:test";
import { buildEditorCourseOptions } from "../../services/assignments/editor-course-options";

function course(id: string, term = "2026-1") {
  return {
    id,
    templateId: "python",
    name: "Python 程序设计",
    term,
    courseNo: "PY",
    currentPublishedKnowledgeGraphVersion: {
      nodes: [
        {
          id: `${id}-chapter`,
          conceptId: `${id}-root`,
          code: "CH-1",
          name: "第1章",
          nodeType: "CHAPTER",
          sortOrder: 1,
        },
        {
          id: `${id}-point`,
          conceptId: `${id}-concept`,
          code: "KP-1-1",
          name: "概述",
          nodeType: "KNOWLEDGE_POINT",
          sortOrder: 1,
        },
      ],
      edges: [{ fromNodeId: `${id}-chapter`, toNodeId: `${id}-point` }],
    },
  };
}

test("同课程同学期合并展示，保留每个教学范围的知识点绑定", () => {
  const result = buildEditorCourseOptions(
    [course("a"), course("b")],
    new Set(["a", "b"]),
  );
  assert.equal(result.length, 1);
  assert.deepEqual(result[0]?.courseIds, ["a", "b"]);
  assert.equal(result[0]?.chapters.length, 1);
  assert.deepEqual(
    result[0]?.chapters[0]?.nodes.map((node) => node.conceptId),
    ["a-concept", "b-concept"],
  );
});

test("不同学期分开，没有正式图谱或没有关联题目的课程不混入选题筛选", () => {
  const result = buildEditorCourseOptions(
    [
      course("a"),
      course("b", "2026-2"),
      course("empty"),
      { ...course("draft"), currentPublishedKnowledgeGraphVersion: null },
    ],
    new Set(["a", "b", "draft"]),
  );
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((item) => item.term),
    ["2026-1", "2026-2"],
  );
});
