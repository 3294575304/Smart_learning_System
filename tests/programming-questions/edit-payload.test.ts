import assert from "node:assert/strict";
import test from "node:test";
import { programmingCasesForSave } from "@/services/programming-questions/edit-payload";
import { programmingTestCaseInputSchema } from "@/services/programming-questions/schemas";

test("已保存用例的只读ID不进入新修订请求，保留输入、输出与分值", () => {
  const readDto = {
    id: "read-only-case-id",
    configRevisionId: "read-only-revision",
    visibility: "HIDDEN" as const,
    name: "负数边界",
    stdin: "-2\n",
    expectedOutput: "-4\n",
    points: 8,
    sortOrder: 7,
  };
  assert.equal(
    programmingTestCaseInputSchema.safeParse(readDto).success,
    false,
  );
  const input = programmingCasesForSave([readDto])[0];
  assert.ok(input);
  assert.equal(programmingTestCaseInputSchema.safeParse(input).success, true);
  assert.equal(input.stdin, "-2\n");
  assert.equal(input.expectedOutput, "-4\n");
  assert.equal(input.points, 8);
  assert.equal(input.sortOrder, 1);
  assert.equal("id" in input, false);
});
