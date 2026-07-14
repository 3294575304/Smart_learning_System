import type { ActionResult } from "@/types/action-result";

export async function requestApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(input, init);
    return (await response.json()) as ActionResult<T>;
  } catch {
    return {
      success: false,
      error: "网络请求失败，请检查连接后重试",
      status: 0,
    };
  }
}
