import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMappingQuestionCatalog,
  mappingQuestionFingerprint,
  type MappingCatalogSource,
} from "@/services/question-mapping/question-catalog";

function question(
  overrides: Partial<MappingCatalogSource> = {},
): MappingCatalogSource {
  return {
    id: "public",
    creatorId: "admin",
    title: "原题",
    content: "判断题 字符串不可变。",
    type: "TRUE_FALSE",
    difficulty: 2,
    visibility: "PUBLIC",
    correctBoolean: true,
    referenceAnswer: null,
    acceptableAnswers: [],
    isCaseSensitive: false,
    gradingConfig: { mode: "EXACT_BOOLEAN" },
    options: [],
    programmingConfigRevisions: [],
    graphBindingSets: [],
    ...overrides,
  };
}

test("公共题目无需副本即可进入未关联候选", () => {
  const rows = buildMappingQuestionCatalog("teacher", [question()]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.hasPublic, true);
  assert.equal(rows[0]?.isBound, false);
});
test("相同私有副本优先展示，重命名不影响去重", () => {
  const rows = buildMappingQuestionCatalog("teacher", [
    question(),
    question({
      id: "copy",
      creatorId: "teacher",
      title: "自定义名称",
      visibility: "PRIVATE",
    }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, "copy");
  assert.equal(rows[0]?.duplicateCount, 1);
  assert.equal(rows[0]?.hasPublic, true);
});
test("已关联的公共原题使相同副本退出未关联候选，管理入口指向已有绑定", () => {
  const rows = buildMappingQuestionCatalog("teacher", [
    question({ graphBindingSets: [{ id: "binding" }] }),
    question({ id: "copy", creatorId: "teacher", visibility: "PRIVATE" }),
  ]);
  assert.equal(rows[0]?.isBound, true);
  assert.equal(rows[0]?.bindingQuestionId, "public");
});
test("答案、选项或编程配置不同不能仅按题干去重", () => {
  const original = question();
  for (const variant of [
    question({ correctBoolean: false }),
    question({ options: [{ label: "A", content: "选项", isCorrect: true }] }),
    question({
      programmingConfigRevisions: [{ configurationHash: "different" }],
    }),
  ])
    assert.notEqual(
      mappingQuestionFingerprint(original),
      mappingQuestionFingerprint(variant),
    );
});
test("编程缩进必须保留，换行格式可以兼容", () => {
  const original = question({
    type: "PYTHON_PROGRAMMING",
    content: "if x:\n    print(x)",
  });
  assert.notEqual(
    mappingQuestionFingerprint(original),
    mappingQuestionFingerprint({ ...original, content: "if x:\nprint(x)" }),
  );
  assert.equal(
    mappingQuestionFingerprint(original),
    mappingQuestionFingerprint({
      ...original,
      content: "if x:\r\n    print(x)",
    }),
  );
});
test("题型不同、大小写评分规则不同不合并", () => {
  const original = question();
  assert.notEqual(
    mappingQuestionFingerprint(original),
    mappingQuestionFingerprint(question({ type: "SHORT_ANSWER" })),
  );
  assert.notEqual(
    mappingQuestionFingerprint(original),
    mappingQuestionFingerprint(question({ isCaseSensitive: true })),
  );
});
test("空题库安全返回空列表，未去重的原始输入保持不变", () => {
  assert.deepEqual(buildMappingQuestionCatalog("teacher", []), []);
  const rows = [
    question(),
    question({ id: "copy", creatorId: "teacher", visibility: "PRIVATE" }),
  ];
  buildMappingQuestionCatalog("teacher", rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.id, "public");
});
