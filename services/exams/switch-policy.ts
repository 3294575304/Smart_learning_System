export const countedExamSwitchKinds = ["VISIBILITY", "WINDOW_SWITCH"] as const;

export const examSwitchEventKinds = [
  ...countedExamSwitchKinds,
  "FULLSCREEN_EXIT",
  "WINDOW_BLUR",
] as const;

export type ExamSwitchEventKind = (typeof examSwitchEventKinds)[number];

export function countsTowardExamSwitchLimit(kind: ExamSwitchEventKind) {
  return countedExamSwitchKinds.some((counted) => counted === kind);
}

export const examWindowBlurThresholdMs = 1500;
