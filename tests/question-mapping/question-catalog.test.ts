import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMappingQuestionCatalog,
  type MappingCatalogSource,
} from "@/services/question-mapping/question-catalog";

function question(
  id: string,
  overrides: Partial<MappingCatalogSource> = {},
): MappingCatalogSource {
  return {
    id,
    title: "字符串不可变",
    type: "TRUE_FALSE",
    difficulty: 2,
    graphBindingSets: [],
    ...overrides,
  };
}

test("映射目录逐题展示共享题，不按题干或答案自动去重", () => {
  const rows = buildMappingQuestionCatalog([
    question("question-a"),
    question("question-b", { title: "字符串不可变" }),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((item) => item.id),
    ["question-a", "question-b"],
  );
  assert.ok(rows.every((item) => item.isBound === false));
});

test("已绑定题目仍可识别其自身绑定身份", () => {
  const rows = buildMappingQuestionCatalog([
    question("question-a", { graphBindingSets: [{ id: "binding" }] }),
  ]);
  assert.equal(rows[0]?.isBound, true);
  assert.equal(rows[0]?.bindingQuestionId, "question-a");
});

test("空目录返回空列表且不修改源数据", () => {
  const source = [question("question-a"), question("question-b")];
  assert.deepEqual(buildMappingQuestionCatalog([]), []);
  buildMappingQuestionCatalog(source);
  assert.equal(source.length, 2);
});
