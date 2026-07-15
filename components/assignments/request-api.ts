import type { ActionResult } from "@/types/action-result";

export async function requestAssignmentApi<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ActionResult<T>> {
  try {
    const response = await fetch(input, init);
    const body = (await response.json()) as
      | { success: true; data: T }
      | {
          success: false;
          error: string;
          fieldErrors?: Record<string, string[]>;
        };
    return body.success ? body : { ...body, status: response.status };
  } catch {
    return {
      success: false,
      error: "网络请求失败，请检查连接后重试",
      status: 0,
    };
  }
}
