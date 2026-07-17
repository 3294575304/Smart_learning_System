export type QuestionTimingState = {
  accumulatedMs: number;
  activeStartedAt: number | null;
};

type PauseReason = "blur" | "hidden";

type Now = () => number;

export class QuestionTimingTracker {
  private readonly states = new Map<string, QuestionTimingState>();
  private readonly pauseReasons = new Set<PauseReason>();
  private activeQuestionId: string | null = null;

  constructor(
    questionIds: string[],
    initialAccumulatedMs: Record<string, number> = {},
    private readonly now: Now = () => performance.now(),
  ) {
    for (const questionId of questionIds) {
      this.states.set(questionId, {
        accumulatedMs: initialAccumulatedMs[questionId] ?? 0,
        activeStartedAt: null,
      });
    }
  }

  activate(questionId: string): void {
    if (!this.states.has(questionId)) return;
    const now = this.now();
    this.checkpointAt(now);
    this.activeQuestionId = questionId;
    const state = this.states.get(questionId);
    if (state && this.pauseReasons.size === 0) state.activeStartedAt = now;
  }

  pause(reason: PauseReason): void {
    if (this.pauseReasons.has(reason)) return;
    this.checkpointAt(this.now());
    this.pauseReasons.add(reason);
    const state = this.activeQuestionId
      ? this.states.get(this.activeQuestionId)
      : undefined;
    if (state) state.activeStartedAt = null;
  }

  resume(reason: Exclude<PauseReason, "unmounted">): void {
    if (!this.pauseReasons.delete(reason) || this.pauseReasons.size > 0) return;
    const state = this.activeQuestionId
      ? this.states.get(this.activeQuestionId)
      : undefined;
    if (state) state.activeStartedAt = this.now();
  }

  deactivate(): void {
    this.checkpointAt(this.now());
    if (!this.activeQuestionId) return;
    const state = this.states.get(this.activeQuestionId);
    if (state) state.activeStartedAt = null;
  }

  checkpoint(): Record<string, number> {
    this.checkpointAt(this.now());
    return this.snapshot();
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(
      [...this.states].map(([questionId, state]) => [
        questionId,
        Math.max(0, Math.round(state.accumulatedMs)),
      ]),
    );
  }

  restoreAccumulated(snapshot: Record<string, number>): void {
    for (const [questionId, accumulatedMs] of Object.entries(snapshot)) {
      const state = this.states.get(questionId);
      if (
        state &&
        Number.isInteger(accumulatedMs) &&
        accumulatedMs >= 0 &&
        accumulatedMs <= 86_400_000
      ) {
        state.accumulatedMs = Math.max(state.accumulatedMs, accumulatedMs);
      }
    }
  }

  getState(questionId: string): QuestionTimingState | undefined {
    const state = this.states.get(questionId);
    return state ? { ...state } : undefined;
  }

  private checkpointAt(now: number): void {
    if (!this.activeQuestionId) return;
    const state = this.states.get(this.activeQuestionId);
    if (!state || state.activeStartedAt === null) return;
    state.accumulatedMs += Math.max(0, now - state.activeStartedAt);
    state.activeStartedAt = this.pauseReasons.size === 0 ? now : null;
  }
}

interface LifecycleEventTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

interface TimingLifecycleOptions {
  documentTarget: LifecycleEventTarget;
  windowTarget: LifecycleEventTarget;
  isHidden: () => boolean;
  hasFocus: () => boolean;
  beforeUnload?: () => void;
}

export function bindQuestionTimingLifecycle(
  tracker: QuestionTimingTracker,
  options: TimingLifecycleOptions,
): () => void {
  const onVisibilityChange = () => {
    if (options.isHidden()) tracker.pause("hidden");
    else tracker.resume("hidden");
  };
  const onFocus = () => tracker.resume("blur");
  const onBlur = () => tracker.pause("blur");
  const onBeforeUnload = () => {
    tracker.checkpoint();
    options.beforeUnload?.();
  };

  options.documentTarget.addEventListener(
    "visibilitychange",
    onVisibilityChange,
  );
  options.windowTarget.addEventListener("focus", onFocus);
  options.windowTarget.addEventListener("blur", onBlur);
  options.windowTarget.addEventListener("beforeunload", onBeforeUnload);

  if (options.isHidden()) tracker.pause("hidden");
  if (!options.hasFocus()) tracker.pause("blur");

  return () => {
    options.documentTarget.removeEventListener(
      "visibilitychange",
      onVisibilityChange,
    );
    options.windowTarget.removeEventListener("focus", onFocus);
    options.windowTarget.removeEventListener("blur", onBlur);
    options.windowTarget.removeEventListener("beforeunload", onBeforeUnload);
    tracker.deactivate();
  };
}
