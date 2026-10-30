export interface AvailabilityRefreshRuntime {
  now(): number;
  hidden(): boolean;
  every(callback: () => void, delay: number): () => void;
  after(callback: () => void, delay: number): () => void;
  focus: EventTarget;
  visibility: EventTarget;
}

export function bindAvailabilityRefresh(
  at: string | null | undefined,
  refreshPage: () => void,
  runtime: AvailabilityRefreshRuntime,
) {
  let lastRefreshAt = Number.NEGATIVE_INFINITY;
  const refresh = (boundary = false) => {
    if (runtime.hidden() || (!boundary && runtime.now() - lastRefreshAt < 1000))
      return;
    lastRefreshAt = runtime.now();
    refreshPage();
  };
  const onFocus = () => refresh();
  const cancelInterval = runtime.every(onFocus, 30_000);
  const boundary = at ? Date.parse(at) : NaN;
  // A focus/interval refresh just before a deadline must not suppress its update.
  const cancelBoundary = Number.isFinite(boundary)
    ? runtime.after(
        () => refresh(true),
        Math.min(2_147_483_647, Math.max(0, boundary - runtime.now() + 250)),
      )
    : null;
  runtime.focus.addEventListener("focus", onFocus);
  runtime.visibility.addEventListener("visibilitychange", onFocus);
  return () => {
    cancelInterval();
    cancelBoundary?.();
    runtime.focus.removeEventListener("focus", onFocus);
    runtime.visibility.removeEventListener("visibilitychange", onFocus);
  };
}
