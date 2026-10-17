import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisKnowledgePointIds,
  presentAnalysisText,
} from "../../services/ai/presentation";
test("知识点编号与错误类型显示中文，历史文字可读且不改写输入", () => {
  const id = "cmsk334kg0001ygesi744d3dk";
  const text = `优先复习知识点 ${id}，错误模式：UNKNOWN`;
  assert.deepEqual(analysisKnowledgePointIds([text, null]), [id]);
  assert.equal(
    presentAnalysisText(text, new Map([[id, "一元一次方程"]])),
    "优先复习知识点 一元一次方程，错误模式：暂未确定",
  );
  assert.ok(text.includes(id));
});
test("无法解析的知识点不暴露内部编号，保留普通代码名称", () => {
  assert.equal(
    presentAnalysisText(
      "知识点 cmsk334kg0001ygesi744d3dk，Python print",
      new Map(),
    ),
    "知识点 相关知识点，Python print",
  );
  assert.equal(
    presentAnalysisText("总体水平：BASIC；错误模式：CALCULATION", new Map()),
    "总体水平：具备基础；错误模式：计算错误",
  );
});
