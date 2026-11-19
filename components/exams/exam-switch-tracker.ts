import {
  countedExamSwitchKinds,
  examWindowBlurThresholdMs,
} from "@/services/exams/switch-policy";

export type CountedExamSwitch = (typeof countedExamSwitchKinds)[number];

export function createExamSwitchTracker() {
  let blurStartedAt: number | undefined;
  let pageWasHidden = false;

  return {
    blur(now: number) {
      blurStartedAt ??= now;
    },
    hide(): CountedExamSwitch | undefined {
      if (pageWasHidden) return;
      pageWasHidden = true;
      return "VISIBILITY";
    },
    resume(now: number, pageIsActive: boolean): CountedExamSwitch | undefined {
      if (!pageIsActive) return;
      const sustainedBlur =
        !pageWasHidden &&
        blurStartedAt !== undefined &&
        now - blurStartedAt >= examWindowBlurThresholdMs;
      blurStartedAt = undefined;
      pageWasHidden = false;
      if (sustainedBlur) return "WINDOW_SWITCH";
    },
  };
}
