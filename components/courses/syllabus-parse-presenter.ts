export type SyllabusParseUiStatus =
  "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";

const parseFailureMessages: Record<string, string> = {
  PROVIDER_TIMEOUT: "AI 服务响应超时，本次未自动重试。请稍后手动重新解析。",
  PROVIDER_UNAVAILABLE: "AI 服务暂时不可用，请稍后重新解析。",
  PROVIDER_EMPTY_RESPONSE:
    "AI 服务连续两次返回空内容。系统已关闭 DeepSeek 默认思考模式；请稍后重新解析，若仍失败请查看服务端 Provider 诊断。",
  PROVIDER_HTTP_ERROR:
    "AI 服务返回错误，请管理员检查模型、额度与接口配置后重试。",
  PROVIDER_SCHEMA_INVALID:
    "AI 服务响应格式与当前接口不兼容，请管理员检查 AI_API_TYPE 和服务地址。",
  PROVIDER_UNREADABLE_RESPONSE:
    "AI 服务返回了无法读取的内容，请管理员检查网关或代理配置。",
  INVALID_AI_JSON: "AI 返回的 JSON 无法读取，自动修复一次后仍失败。",
  INVALID_AI_OUTPUT: "AI 返回内容不符合教学大纲结构要求。",
  AI_OUTPUT_TRUNCATED:
    "AI 输出在自动紧凑重试后仍被截断，请提高 SYLLABUS_AI_MAX_COMPLETION_TOKENS 后重新解析。",
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
