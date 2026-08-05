export type SyllabusParseUiStatus =
  "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";

const parseFailureMessages: Record<string, string> = {
  PROVIDER_TIMEOUT: "AI 服务响应超时，本次未自动重试。请稍后手动重新解析。",
  PROVIDER_UNAVAILABLE: "AI 服务暂时不可用，请稍后重新解析。",
  INVALID_AI_JSON: "AI 返回的 JSON 无法读取，自动修复一次后仍失败。",
  INVALID_AI_OUTPUT: "AI 返回内容不符合教学大纲结构要求。",
  AI_OUTPUT_TRUNCATED:
    "AI 输出因长度限制被截断，请调整模型输出限制后重新解析。",
  JOB_INTERRUPTED: "后台解析任务被中断，请重新解析。",
};

export function shouldPollSyllabusParse(
  status: SyllabusParseUiStatus | undefined,
) {
  return status === "PENDING" || status === "PROCESSING";
}

export function syllabusParseFailureMessage(code: string | null) {
  return (
    (code && parseFailureMessages[code]) ?? code ?? "文件或解析服务暂时不可用"
  );
}
