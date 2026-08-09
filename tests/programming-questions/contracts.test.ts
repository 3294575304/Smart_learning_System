import assert from "node:assert/strict";
import test from "node:test";

import { ProgrammingTestVisibility } from "@prisma/client";

import { programmingConfigFingerprints } from "@/services/programming-questions/fingerprint";
import { programmingConfigRevisionInputSchema } from "@/services/programming-questions/schemas";

function validInput() {
  return {
    standardCode: "print(input())",
    starterCode: "# 在这里编写代码\n",
    totalPoints: 10,
    limits: {
      cpuTimeMs: 1_000,
      wallTimeMs: 2_000,
      memoryBytes: 64 * 1024 * 1024,
      outputBytes: 16 * 1024,
      processCount: 2,
    },
    testCases: [
      {
        visibility: ProgrammingTestVisibility.PUBLIC,
        name: "样例 1",
        stdin: "hello\n",
        expectedOutput: "hello\n",
        points: 2,
        sortOrder: 1,
      },
      {
        visibility: ProgrammingTestVisibility.HIDDEN,
        name: "隐藏 1",
        stdin: "secret\n",
        expectedOutput: "secret\n",
        points: 8,
        sortOrder: 2,
      },
    ],
  };
}

test("Python 配置要求公开、隐藏用例和分值总和一致", () => {
  assert.equal(
    programmingConfigRevisionInputSchema.safeParse(validInput()).success,
    true,
  );
  assert.equal(
    programmingConfigRevisionInputSchema.safeParse({
      ...validInput(),
      totalPoints: 9,
    }).success,
    false,
  );
  assert.equal(
    programmingConfigRevisionInputSchema.safeParse({
      ...validInput(),
      testCases: validInput().testCases.map((item) => ({
        ...item,
        visibility: ProgrammingTestVisibility.PUBLIC,
      })),
    }).success,
    false,
  );
});

test("Python 配置指纹不受输入用例数组顺序影响", () => {
  const first = programmingConfigRevisionInputSchema.parse(validInput());
  const second = programmingConfigRevisionInputSchema.parse({
    ...validInput(),
    testCases: [...validInput().testCases].reverse(),
  });
  assert.deepEqual(
    programmingConfigFingerprints(first),
    programmingConfigFingerprints(second),
  );
});
