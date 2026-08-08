import type {
  SandboxExecutionRequest,
  SandboxExecutionResult,
  SandboxSubmissionReceipt,
} from "@/services/sandbox-executor/schemas";

export interface SandboxExecutor {
  readonly transport: "REMOTE";
  submitExecution(
    request: SandboxExecutionRequest,
  ): Promise<SandboxSubmissionReceipt>;
  getExecution(executionId: string): Promise<SandboxExecutionResult>;
  cancelExecution(executionId: string): Promise<void>;
}
