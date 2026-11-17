import assert from "node:assert/strict";
import test from "node:test";

import {
  programmingStatementSections,
  programmingStatementText,
} from "../../services/programming-questions/statement";

const REAL_QUESTION = [
  "编程任务",
  "输入整数n，创建a=[n]并让b引用a，向b追加n+1。输出a中的元素，以空格分隔。",
  "输入从标准输入读取，输出中不得包含交互提示。",
  "公开样例输入",
  "1",
  "公开样例输出",
  "1 2",
  "评分要点：按测试用例独立评分，各2分，总分10分。",
].join("\n");

test("纯叙述题干返回一个无标题小节", () => {
  assert.deepEqual(programmingStatementSections("给定两个整数，求和。"), [
    { title: null, body: "给定两个整数，求和。" },
  ]);
});

test("真实导入题按小节切开，并剔除公开样例", () => {
  assert.deepEqual(
    programmingStatementSections(REAL_QUESTION, { dropSamples: true }),
    [
      {
        title: "编程任务",
        body: [
          "输入整数n，创建a=[n]并让b引用a，向b追加n+1。输出a中的元素，以空格分隔。",
          "输入从标准输入读取，输出中不得包含交互提示。",
        ].join("\n"),
      },
      { title: "评分要点", body: "按测试用例独立评分，各2分，总分10分。" },
    ],
  );
});

test("没有结构化样例时保留题干里的样例小节", () => {
  const sections = programmingStatementSections(REAL_QUESTION);
  assert.deepEqual(
    sections.map((section) => section.title),
    ["编程任务", "公开样例输入", "公开样例输出", "评分要点"],
  );
  assert.equal(sections[1].body, "1");
  assert.equal(sections[2].body, "1 2");
});

test("「输入格式」不会被当成样例标题", () => {
  assert.deepEqual(programmingStatementSections("输入格式\n一行文本"), [
    { title: "输入格式", body: "一行文本" },
  ]);
});

test("「名称：内容」拆成标题与首行正文", () => {
  assert.deepEqual(
    programmingStatementSections("输入格式：一行英文文本，长度不超过 1000。", {
      dropSamples: true,
    }),
    [{ title: "输入格式", body: "一行英文文本，长度不超过 1000。" }],
  );
});

test("代码围栏内的行不当作小节标题", () => {
  const text = ["编程任务", "```", "输入格式", "```", "结束"].join("\n");
  assert.deepEqual(programmingStatementSections(text), [
    { title: "编程任务", body: ["```", "输入格式", "```", "结束"].join("\n") },
  ]);
});

test("加粗写法的样例标题同样会被剔除", () => {
  const text = [
    "编程任务",
    "写代码",
    "**样例输入 1**",
    "7",
    "**提示**",
    "注意空格",
  ].join("\n");
  assert.deepEqual(programmingStatementSections(text, { dropSamples: true }), [
    { title: "编程任务", body: "写代码" },
    { title: "提示", body: "注意空格" },
  ]);
});

test("programmingStatementText 抹掉样例原始数据但保留评分要点", () => {
  const statement = programmingStatementText(REAL_QUESTION);
  assert.ok(!statement.includes("公开样例输入"));
  assert.ok(!statement.includes("公开样例输出"));
  assert.ok(!statement.includes("1 2"));
  assert.ok(statement.includes("编程任务"));
  assert.ok(statement.includes("评分要点"));
  assert.ok(statement.includes("按测试用例独立评分"));
});

test("programmingStatementText 保持小节标题独立成行，交给 QuestionText 渲染", () => {
  const statement = programmingStatementText(REAL_QUESTION);
  assert.equal(statement.split("\n")[0], "编程任务");
  assert.ok(statement.includes("\n评分要点\n"));
});
