export async function requestCourseSurveyApi<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => null)) as
    { success: true; data: T } | { success: false; error: string } | null;
  if (!response.ok || !payload?.success) {
    throw new Error(
      payload && !payload.success ? payload.error : "请求失败，请稍后重试。",
    );
  }
  return payload.data;
}
