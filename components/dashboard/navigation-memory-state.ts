export const NAVIGATION_MEMORY_MAX_AGE = 24 * 60 * 60 * 1000;
export type PageMemory = {
  at: number;
  y: number;
  url: string;
  details: string[];
};
export function parsePageMemory(
  value: unknown,
  now = Date.now(),
): PageMemory | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<PageMemory>;
  if (
    typeof item.at !== "number" ||
    !Number.isFinite(item.at) ||
    item.at > now ||
    now - item.at > NAVIGATION_MEMORY_MAX_AGE ||
    typeof item.y !== "number" ||
    !Number.isFinite(item.y) ||
    item.y < 0 ||
    typeof item.url !== "string" ||
    !/^\/(student|teacher|admin|notifications)(\/|\?|$)/u.test(item.url) ||
    !Array.isArray(item.details) ||
    item.details.length > 100 ||
    !item.details.every((detail) => typeof detail === "string")
  )
    return null;
  return item as PageMemory;
}
export function rememberedReturnUrl(
  value: unknown,
  pathname: string,
  now = Date.now(),
) {
  const memory = parsePageMemory(value, now);
  if (!memory) return null;
  const target = new URL(memory.url, "https://navigation.local");
  return target.origin === "https://navigation.local" &&
    target.pathname === pathname &&
    target.search
    ? `${target.pathname}${target.search}`
    : null;
}
