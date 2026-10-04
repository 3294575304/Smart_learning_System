import assert from "node:assert/strict";
import test from "node:test";
import { parseQuestionImportText } from "@/services/question-import/parser";

test("中文题号编程文档保留全部题目和样例，不把题干中的判断误作判断题", () => {
  const text = `Python 全章节编程题\n第01题 日期合法性判断\n知识点\n第4章 选择结构；建议难度 3 / 5\n编程任务\n判断日期是否合法\n输入格式\n三个整数\n输出格式\nVALID或INVALID\n样例输入\n2024 2 29\n样例输出\nVALID\n评分要点\n闰年规则3分\nB卷 第1页\n第 02 题 循环统计\n编程任务\n统计数位\n输入格式\n整数\n输出格式\n计数\n样例输入\n100205\n样例输出\n8 3\n评分要点\n循环10分`;
  const rows = parseQuestionImportText(text, "PDF", "练习.pdf");
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every(
      (row) =>
        row.type === "PYTHON_PROGRAMMING" &&
        row.answer?.kind === "PROGRAMMING" &&
        !row.issues.length,
    ),
  );
  assert.equal(rows[0]?.difficulty, 3);
  assert.match(rows[0]?.content ?? "", /2024 2 29/);
  assert.doesNotMatch(rows[0]?.content ?? "", /B卷/);
  assert.match(rows[1]?.content ?? "", /100205/);
});

test("原有数字题号选择题仍识别选项和答案", () => {
  const rows = parseQuestionImportText(
    "1. 单选题 一加一？\nA. 1\nB. 2\n答案：B\n解析：加法\n2. 判断题 二大于一\n答案：正确\n解析：比较",
    "TXT",
    "题目.txt",
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.type, "SINGLE_CHOICE");
  assert.equal(rows[1]?.type, "TRUE_FALSE");
  assert.deepEqual(rows[0]?.answer, {
    kind: "CHOICE",
    correctOptionLabels: ["B"],
  });
});

test("未提供评分依据的编程题保留草稿语义而不伪造标准答案", () => {
  const rows = parseQuestionImportText(
    "第01题 循环\n编程任务\n计算求和\n输入格式\n整数\n输出格式\n和",
    "TXT",
    "编程题.txt",
  );
  assert.equal(rows[0]?.type, "PYTHON_PROGRAMMING");
  assert.deepEqual(rows[0]?.answer, { kind: "PROGRAMMING" });
});
