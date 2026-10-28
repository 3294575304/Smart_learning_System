import { practiceSetQuerySchema } from "./types";
/** Accept only the practice list and known filters; never follow an external return URL. */
export function practiceListReturnUrl(value: string | null | undefined) {
  if (
    !value ||
    !value.startsWith("/student/recommendations?") ||
    value.includes("\\")
  )
    return "/student/recommendations";
  try {
    const url = new URL(value, "https://practice.invalid");
    if (
      url.origin !== "https://practice.invalid" ||
      url.pathname !== "/student/recommendations"
    )
      return "/student/recommendations";
    const parsed = practiceSetQuerySchema.safeParse(
      Object.fromEntries(
        ["section", "courseId", "keyword", "status", "page"].flatMap((key) =>
          url.searchParams.has(key) ? [[key, url.searchParams.get(key)]] : [],
        ),
      ),
    );
    if (!parsed.success) return "/student/recommendations";
    const params = new URLSearchParams({ view: "recommended" });
    for (const [key, value] of Object.entries(parsed.data))
      if (value !== undefined) params.set(key, String(value));
    return `/student/recommendations?${params}`;
  } catch {
    return "/student/recommendations";
  }
}
export function practiceListQuery(search: string) {
  const params = new URLSearchParams(search);
  return practiceSetQuerySchema.safeParse(
    Object.fromEntries(
      ["section", "courseId", "keyword", "status", "page"].flatMap((key) =>
        params.has(key) ? [[key, params.get(key)]] : [],
      ),
    ),
  );
}
