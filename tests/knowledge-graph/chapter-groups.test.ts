import assert from "node:assert/strict";
import test from "node:test";
import { groupKnowledgeChapters } from "../../services/knowledge-graph/chapter-groups";

test("chapters follow containment through sections, retain orphan points, and handle cycles", () => {
  const node = (id: string, nodeType: string) => ({
    id,
    conceptId: `concept-${id}`,
    name: id,
    code: id,
    nodeType,
  });
  const result = groupKnowledgeChapters(
    [
      node("chapter", "CHAPTER"),
      node("section", "SECTION"),
      node("point", "KNOWLEDGE_POINT"),
      node("other", "KNOWLEDGE_POINT"),
    ],
    [
      { fromNodeId: "chapter", toNodeId: "section" },
      { fromNodeId: "section", toNodeId: "point" },
      { fromNodeId: "point", toNodeId: "section" },
    ],
  );
  assert.deepEqual(
    result.map((group) => [group.id, group.nodes.map((point) => point.id)]),
    [
      ["chapter", ["point"]],
      ["ungrouped", ["other"]],
    ],
  );
});
