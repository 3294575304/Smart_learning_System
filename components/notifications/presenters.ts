export function formatUnreadBadge(count: number): string | null {
  const safeCount = Math.max(0, Math.trunc(count));
  if (safeCount === 0) return null;
  return safeCount > 99 ? "99+" : String(safeCount);
}
