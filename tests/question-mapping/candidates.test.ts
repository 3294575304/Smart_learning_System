import assert from "node:assert/strict";
import test from "node:test";

import { localQuestionConceptCandidates } from "../../services/question-mapping/candidates";

test("local fallback ranks direct concept matches first and caps candidates", () => {
  const result = localQuestionConceptCandidates(
    { title: "Python 循环", content: "请使用 for 循环求和", tags: [] },
    [
      {
        id: "n1",
        conceptId: "c1",
        code: "LOOP",
        name: "循环",
        description: "for while",
      },
      {
        id: "n2",
        conceptId: "c2",
        code: "LIST",
        name: "列表",
        description: null,
      },
      {
        id: "n3",
        conceptId: "c3",
        code: "FUNC",
        name: "函数",
        description: null,
      },
      {
        id: "n4",
        conceptId: "c4",
        code: "IO",
        name: "输入输出",
        description: null,
      },
    ],
  );
  assert.equal(result.length, 3);
  assert.equal(result[0]?.conceptId, "c1");
  assert.equal(result[0]?.confidence, 0.9);
});
