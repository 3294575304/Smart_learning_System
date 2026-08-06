import type { ActionResult } from "@/types/action-result";

export async function requestApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(input, init);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("success" in payload))
      throw new Error("Invalid API response envelope");
    const record = payload as Record<string, unknown>;
    if (record.success === true && "data" in record)
      return { success: true, data: record.data as T };
    if (record.success === false && "error" in record)
      return {
        success: false,
        error:
          typeof record.error === "string"
            ? record.error
            : "服务器暂时无法处理请求",
        status: response.status,
        ...(typeof record.code === "string" ? { code: record.code } : {}),
        ...(isFieldErrors(record.fieldErrors)
          ? {
              fieldErrors: record.fieldErrors,
            }
          : {}),
      };
    throw new Error("Invalid API response envelope");
  } catch {
    return {
      success: false,
      error: "网络请求失败，请检查连接后重试",
      status: 0,
    };
  }
}

function isFieldErrors(value: unknown): value is Record<string, string[]> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    Object.values(value as Record<string, unknown>).every(
      (messages) =>
        Array.isArray(messages) &&
        messages.every((message) => typeof message === "string"),
    )
  );
}
