import type { SandboxExecutionResult } from "@/services/sandbox-executor/schemas";

const MAX_STUDENT_OUTPUT = 16_384;
const MAX_INTERNAL_OUTPUT = 65_536;

function bounded(value: string) {
  return value.slice(0, MAX_STUDENT_OUTPUT);
}

export function sanitizedInternalExecutionResult(
  result: SandboxExecutionResult,
): SandboxExecutionResult {
  return {
    ...result,
    stdout: result.stdout.slice(0, MAX_INTERNAL_OUTPUT),
    stderr: result.stderr.slice(0, MAX_INTERNAL_OUTPUT),
    tests: result.tests.map((test) => ({
      ...test,
      stdout:
        test.visibility === "HIDDEN"
          ? ""
          : test.stdout.slice(0, MAX_INTERNAL_OUTPUT),
      stderr:
        test.visibility === "HIDDEN"
          ? ""
          : test.stderr.slice(0, MAX_INTERNAL_OUTPUT),
    })),
  };
}

export function studentVisibleExecutionResult(result: SandboxExecutionResult) {
  return {
    executionId: result.executionId,
    status: result.status,
    errorType: result.errorType,
    exitCode: result.exitCode,
    stdout: bounded(result.stdout),
    stderr: bounded(result.stderr),
    resourceUsage: result.resourceUsage,
    tests: result.tests
      .filter((test) => test.visibility === "PUBLIC")
      .map((test) => ({
        testId: test.testId,
        passed: test.passed,
        errorType: test.errorType,
        stdout: bounded(test.stdout),
        stderr: bounded(test.stderr),
      })),
  };
}
