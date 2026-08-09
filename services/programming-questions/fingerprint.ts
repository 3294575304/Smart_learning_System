import { createHash } from "node:crypto";

import type { ProgrammingConfigRevisionInput } from "@/services/programming-questions/schemas";
import { PROGRAMMING_JUDGE_RULE_VERSION } from "@/services/programming-questions/constants";

function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function programmingConfigFingerprints(
  input: ProgrammingConfigRevisionInput,
) {
  const orderedCases = [...input.testCases]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((testCase) => ({
      visibility: testCase.visibility,
      name: testCase.name,
      stdin: testCase.stdin,
      expectedOutput: testCase.expectedOutput,
      points: testCase.points.toFixed(2),
      sortOrder: testCase.sortOrder,
    }));
  const testCasesHash = sha256(orderedCases);
  return {
    testCasesHash,
    configurationHash: sha256({
      standardCode: input.standardCode,
      starterCode: input.starterCode,
      totalPoints: input.totalPoints.toFixed(2),
      limits: input.limits,
      testCasesHash,
      executorRuleVersion: PROGRAMMING_JUDGE_RULE_VERSION,
    }),
  };
}
