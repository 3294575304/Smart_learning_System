import assert from "node:assert/strict";
import test from "node:test";
import { needsProgrammingScoreReview } from "@/services/programming-attempts/review-policy";

test("语法或运行错误转复核，保留按用例计算的部分分", () => {
  assert.equal(
    needsProgrammingScoreReview("SYNTAX_ERROR", 0, 10, "for i in range(5)"),
    true,
  );
  assert.equal(
    needsProgrammingScoreReview("RUNTIME_ERROR", 4, 10, "print(1/0)"),
    true,
  );
});
test("空答案、全对、答案错误和系统错误不自动授予过程分", () => {
  assert.equal(needsProgrammingScoreReview("SYNTAX_ERROR", 0, 10, " "), false);
  assert.equal(
    needsProgrammingScoreReview("RUNTIME_ERROR", 10, 10, "print(1)"),
    false,
  );
  assert.equal(
    needsProgrammingScoreReview("WRONG_ANSWER", 0, 10, "print(1)"),
    false,
  );
  assert.equal(
    needsProgrammingScoreReview("SYSTEM_ERROR", 0, 10, "print(1)"),
    false,
  );
});
