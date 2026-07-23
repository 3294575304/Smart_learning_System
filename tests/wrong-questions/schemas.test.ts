import assert from "node:assert/strict";
import test from "node:test";
import { QuestionType } from "@prisma/client";

import {
  wrongQuestionListQuerySchema,
  wrongQuestionMasterySchema,
  wrongQuestionPracticeSchema,
} from "../../services/wrong-questions/schemas";

test("错题查询使用安全的分页默认值", () => {
  assert.deepEqual(wrongQuestionListQuerySchema.parse({}), {
    page: 1,
    pageSize: 12,
  });
});

test("错题查询解析全部筛选条件", () => {
  const result = wrongQuestionListQuerySchema.parse({
    keyword: " 一次函数 ",
    classroomId: "cm123456789",
    knowledgePointId: "cm987654321",
    type: QuestionType.FILL_BLANK,
    isMastered: "false",
    recentDays: "30",
    page: "2",
    pageSize: "20",
  });
  assert.deepEqual(result, {
    keyword: "一次函数",
    classroomId: "cm123456789",
    knowledgePointId: "cm987654321",
    type: QuestionType.FILL_BLANK,
    isMastered: false,
    recentDays: 30,
    page: 2,
    pageSize: 20,
  });
});

test("错题查询拒绝 studentId、非法分页和非法最近天数", () => {
  assert.equal(
    wrongQuestionListQuerySchema.safeParse({ studentId: "cm123456789" })
      .success,
    false,
  );
  assert.equal(
    wrongQuestionListQuerySchema.safeParse({ page: "0", pageSize: "51" })
      .success,
    false,
  );
  assert.equal(
    wrongQuestionListQuerySchema.safeParse({ recentDays: "365" }).success,
    false,
  );
});

test("掌握状态操作只接受 isMastered 且保持严格输入", () => {
  assert.deepEqual(wrongQuestionMasterySchema.parse({ isMastered: true }), {
    isMastered: true,
  });
  assert.equal(
    wrongQuestionMasterySchema.safeParse({
      isMastered: true,
      wrongCount: 99,
    }).success,
    false,
  );
});

test("重新练习校验答案结构并拒绝重复选项", () => {
  assert.equal(
    wrongQuestionPracticeSchema.safeParse({
      answer: {
        kind: "CHOICE",
        optionIds: ["cm123456789", "cm123456789"],
      },
    }).success,
    false,
  );
  assert.equal(
    wrongQuestionPracticeSchema.safeParse({
      answer: { kind: "TEXT", value: "  " },
    }).success,
    false,
  );
  assert.equal(
    wrongQuestionPracticeSchema.safeParse({
      answer: { kind: "BOOLEAN", value: true },
    }).success,
    true,
  );
});
