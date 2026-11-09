import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantIntentTerms,
  readAssistantIntent,
} from "@/services/course-analytics/teacher-assistant-intent";

test("教师助手区分页面查找、排查、组合评价与考试和作业组卷", () => {
  const cases = [
    ["成绩台账在哪里？", ["GRADEBOOK"], "find"],
    ["为什么学生看不到作业？", ["ASSIGNMENTS"], "troubleshoot"],
    ["帮我生成本班成绩台账和教学质量分析", ["BOTH"], "do"],
    ["本班成绩为什么看不到？", ["GRADING"], "troubleshoot"],
    ["我要组卷", ["ASSIGNMENT_ASSEMBLY"], "do"],
    ["期末考试在哪组卷", ["EXAM_ASSEMBLY"], "find"],
    ["导入试卷失败", ["EXAM_IMPORT"], "troubleshoot"],
    ["导入学生名单并发起签到", ["ROSTER", "ATTENDANCE"], "do"],
  ] as const;
  for (const [text, topics, mode] of cases) {
    assert.deepEqual(
      readAssistantIntent(text),
      { topics, mode, followUp: false },
      text,
    );
  }
  assert.equal(readAssistantIntent("还是打不开？").followUp, true);
  assert.equal(readAssistantIntent("课程内容没学会").followUp, false);
});

test("教师助手的模型输入只包含预先允许的功能词语", () => {
  assert.deepEqual(
    assistantIntentTerms(
      "张三 13812345678 alice@example.com 的分数结果怎么导出",
    ),
    ["分数", "结果", "怎么", "导出"],
  );
});
