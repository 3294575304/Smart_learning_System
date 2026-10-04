import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { extractDocxText } from "../../services/question-import/docx-extractor";
import { parseQuestionImportText } from "../../services/question-import/parser";

test("大型中文Word跨UTF8读取边界不丢失答案和题型标记", async () => {
  const text = await extractDocxText(
    await readFile(
      new URL("./fixtures/chinese-stream-boundary.docx", import.meta.url),
    ),
  );
  assert.doesNotMatch(text, /\uFFFD/u);
  assert.equal(text.match(/答案：正确/gu)?.length, 200);
  assert.equal(parseQuestionImportText(text, "DOCX", "中文.docx").length, 200);
});

test("混合文档显式题型不被前文编程题及判断解析污染", () => {
  const rows = parseQuestionImportText(
    "题号：1\n编程任务\n输出数字\n评分要点：输出正确\n题号：2\n填空题 主入口判断使用____\n答案：__main__\n解析：判断入口\n题号：3\n简答题 解释变量\n答案：名字引用对象\n解析：赋值",
    "DOCX",
    "混合.docx",
  );
  assert.deepEqual(
    rows.map((r) => r.type),
    ["PYTHON_PROGRAMMING", "FILL_BLANK", "SHORT_ANSWER"],
  );
  assert.ok(rows.every((r) => r.issues.length === 0));
});

test("Word判题配置完整保留且不混入学生题干，非法配置阻止导入", () => {
  const config = {
    standardCode: "print(input())",
    starterCode: "",
    totalPoints: 10,
    limits: {
      cpuTimeMs: 1000,
      wallTimeMs: 2000,
      memoryBytes: 67108864,
      outputBytes: 1024,
      processCount: 1,
    },
    testCases: [
      {
        visibility: "PUBLIC",
        name: "样例",
        stdin: "a\n",
        expectedOutput: "a\n",
        points: 5,
        sortOrder: 1,
      },
      {
        visibility: "HIDDEN",
        name: "隐藏",
        stdin: "b\n",
        expectedOutput: "b\n",
        points: 5,
        sortOrder: 2,
      },
    ],
  };
  const text = `题号：1\n编程任务\n原样输出文本\n解析：文本输出\n评分要点：按用例评分\n判题配置开始\n${JSON.stringify(config)}\n判题配置结束`;
  const row = parseQuestionImportText(text, "DOCX", "编程.docx")[0];
  assert.deepEqual(row?.programmingConfig, config);
  assert.doesNotMatch(row?.content ?? "", /standardCode|HIDDEN/);
  assert.equal(row?.issues.length, 0);
  const invalid = parseQuestionImportText(
    text.replace(JSON.stringify(config), "{}"),
    "DOCX",
    "编程.docx",
  )[0];
  assert.equal(invalid?.answer, null);
  assert.ok(invalid?.issues.some((i) => i.startsWith("判题配置无效")));
});

test("选项正文提到知识点不会污染显式分类", () => {
  const row = parseQuestionImportText(
    "题号：1\n标题：循环概念\n单选题 哪项正确？\nA. 学习这一知识点不需要输入\nB. for可遍历序列\n答案：B\n解析：遍历序列\n知识点：KP-5-2；for循环；Python全章节20261008",
    "DOCX",
    "混合.docx",
  )[0];
  assert.ok(row?.tags.includes("KP-5-2"));
  assert.ok(row?.tags.includes("Python全章节20261008"));
  assert.equal(row?.title, "循环概念");
});

test("括号题号、全角小写选项与同行选项保持正确答案", () => {
  const rows = parseQuestionImportText(
    "（1）单选题 哪个是整数？\nａ．1.5  ｂ．2  ｃ．文本\n【答案】ｂ\n【解析】2是整数。\n(2)判断题 input返回字符串。\n【答案】✓\n【解析】返回字符串",
    "DOCX",
    "格式.docx",
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows[0]?.options.map((o) => o.label),
    ["A", "B", "C"],
  );
  assert.deepEqual(rows[0]?.answer, {
    kind: "CHOICE",
    correctOptionLabels: ["B"],
  });
  assert.deepEqual(rows[1]?.answer, { kind: "BOOLEAN", value: true });
  assert.ok(rows.every((r) => r.issues.length === 0));
});

test("单题文件保留整段，未声明选择题型按答案数量区分多选", () => {
  const rows = parseQuestionImportText(
    "1)判断下面哪些是可变容器？\nA. 列表\nB. 字典\nC. 元组\n答案：A、B\n解析：列表与字典可变",
    "TXT",
    "单题.txt",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.type, "MULTIPLE_CHOICE");
  assert.deepEqual(rows[0]?.answer, {
    kind: "CHOICE",
    correctOptionLabels: ["A", "B"],
  });
});

test("没有题号的单题不拆成题干、答案、解析三道题", () => {
  const rows = parseQuestionImportText(
    "简答题 请说明列表与元组的区别。\n答案：列表可变，元组不可变。\n解析：可变性不同。",
    "TXT",
    "单题.txt",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.type, "SHORT_ANSWER");
  assert.equal(rows[0]?.issues.length, 0);
});

test("单次超500题明确报错而不静默截断", () => {
  const text = Array.from(
    { length: 501 },
    (_, i) =>
      `题号：${i + 1}\n判断题 Python支持整数。\n答案：正确\n解析：内置整数类型。`,
  ).join("\n");
  assert.throws(
    () => parseQuestionImportText(text, "DOCX", "超量.docx"),
    /501.*500.*未截断/,
  );
});

test("无题号混合题型可按明确题型拆分，答案与解析不是新题", () => {
  const rows = parseQuestionImportText(
    "判断题 Python字符串不可变。\n答案：正确\n解析：不能修改单个字符。\n填空题 计算长度使用____。\n答案：len\n解析：内置长度函数。",
    "TXT",
    "无题号.txt",
  );
  assert.equal(rows.length, 2);
  assert.deepEqual(
    rows.map((r) => r.type),
    ["TRUE_FALSE", "FILL_BLANK"],
  );
  assert.ok(rows.every((r) => r.issues.length === 0));
});

test("两题之间的章节标题不进入上一题的正文和解析", () => {
  const rows = parseQuestionImportText(
    "题号：1\n简答题 请说明字符串。\n答案：字符序列。\n解析：字符串不可变。\n知识点：字符串\n第2章 基本数据类型\n题号：2\n判断题 整数可用于计数。\n答案：正确\n解析：支持整数。",
    "DOCX",
    "章节.docx",
  );
  assert.equal(rows.length, 2);
  assert.ok(!rows[0]?.content.includes("第2章"));
  assert.ok(!rows[0]?.explanation?.includes("第2章"));
});
