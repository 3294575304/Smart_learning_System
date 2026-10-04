import assert from "node:assert/strict";
import test from "node:test";
import { orderedCourseConceptOptions } from "../../services/questions/course-concept-options";

test("知识点按正式章节及章内顺序排列，不再跨章交错", () => {
  const chapter = (n: number) => ({
    id: `ch${n}`,
    conceptId: `chapter${n}`,
    code: `CH-${n}`,
    name: `第${n}章`,
    nodeType: "CHAPTER",
    sortOrder: n,
  });
  const point = (chapter: number, n: number) => ({
    id: `kp${chapter}-${n}`,
    conceptId: `concept${chapter}-${n}`,
    code: `KP-${chapter}-${n}`,
    name: `知识点${chapter}-${n}`,
    nodeType: "KNOWLEDGE_POINT",
    sortOrder: n,
  });
  const result = orderedCourseConceptOptions(
    [
      point(11, 1),
      point(2, 1),
      point(1, 2),
      chapter(11),
      chapter(2),
      chapter(1),
      point(1, 1),
      chapter(10),
      point(10, 1),
    ],
    [
      [1, 1],
      [1, 2],
      [2, 1],
      [10, 1],
      [11, 1],
    ].map(([c, n]) => ({ fromNodeId: `ch${c}`, toNodeId: `kp${c}-${n}` })),
  );
  assert.deepEqual(
    result.map((p) => p.code),
    ["KP-1-1", "KP-1-2", "KP-2-1", "KP-10-1", "KP-11-1"],
  );
  assert.deepEqual(
    result.map((p) => p.chapterName),
    ["第1章", "第1章", "第2章", "第10章", "第11章"],
  );
});

test("没有章节关系的知识点放在末尾，保留原筛选值", () => {
  const result = orderedCourseConceptOptions(
    [
      {
        id: "point",
        conceptId: "stable",
        code: "CUSTOM",
        name: "补充知识点",
        nodeType: "KNOWLEDGE_POINT",
        sortOrder: 1,
      },
    ],
    [],
  );
  assert.equal(result[0]?.chapterName, "未分章知识点");
  assert.equal(result[0]?.conceptId, "CODE:CUSTOM");
});
