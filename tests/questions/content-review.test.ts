import assert from "node:assert/strict";
import test from "node:test";
import { questionContentReview } from "../../services/questions/content-review";
test("检测独立页码和答案区，不误删代码或题干中提到答案的正常句子", () => {
  assert.equal(questionContentReview("解释 is 和 ==\n第 3 页").length, 1);
  assert.equal(questionContentReview("题干\n参考答案：对象标识").length, 1);
  assert.equal(
    questionContentReview("下面哪个答案正确？\nprint('第3页')").length,
    0,
  );
});
