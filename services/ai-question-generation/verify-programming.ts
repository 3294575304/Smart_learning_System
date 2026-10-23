import "server-only";

import { randomUUID } from "node:crypto";

import { AIQuestionGenerationError } from "@/services/ai-question-generation/errors";
import { normalizeProgramOutput } from "@/services/programming-attempts/fingerprint";
import type { ProgrammingConfigRevisionInput } from "@/services/programming-questions/schemas";
import { HttpSandboxExecutor } from "@/services/sandbox-executor/http-executor";

export async function verifyProgrammingCandidate(
  config: ProgrammingConfigRevisionInput,
) {
  if (config.testCases.length > 10)
    throw new AIQuestionGenerationError("AI 编程题最多保留 10 个测试用例", 400);
  const executor = new HttpSandboxExecutor();
  for (const testCase of config.testCases) {
    let executionId: string | null = null;
    try {
      const receipt = await executor.submitExecution({
        requestId: randomUUID(),
        language: "PYTHON",
        sourceCode: config.standardCode,
        stdin: testCase.stdin,
        networkAccess: false,
        limits: config.limits,
        metadata: { purpose: "FUTURE_JUDGE" },
      });
      executionId = receipt.executionId;
      let finished = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const result = await executor.getExecution(receipt.executionId);
        if (result.status === "QUEUED" || result.status === "RUNNING") {
          await new Promise((resolve) => setTimeout(resolve, 250));
          continue;
        }
        finished = true;
        if (
          result.status !== "SUCCEEDED" ||
          result.errorType !== "NONE" ||
          normalizeProgramOutput(result.stdout) !==
            normalizeProgramOutput(testCase.expectedOutput)
        )
          throw new AIQuestionGenerationError(
            `参考代码未通过测试用例「${testCase.name}」，请修改后重试`,
            409,
          );
        break;
      }
      if (!finished)
        throw new AIQuestionGenerationError("沙箱验证超时，请稍后重试", 503);
    } catch (error) {
      if (error instanceof AIQuestionGenerationError) throw error;
      throw new AIQuestionGenerationError(
        "隔离沙箱不可用，暂不能确认编程题",
        503,
      );
    } finally {
      if (executionId)
        await executor.cancelExecution(executionId).catch(() => undefined);
    }
  }
}
