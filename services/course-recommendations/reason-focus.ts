import type { QuestionType } from "@prisma/client";
import { z } from "zod";

export const COURSE_RECOMMENDATION_REASON_PROMPT_VERSION =
  "course-recommendation-focus-v1";

const focusSchema = z.enum([
  "DIAGNOSTIC_EVIDENCE",
  "LOW_MASTERY",
  "PREREQUISITE_GAP",
  "CORE_CONCEPT",
  "TEACHER_PRIORITY",
]);
type Focus = z.infer<typeof focusSchema>;
const outputSchema = z
  .object({
    items: z
      .array(
        z
          .object({ key: z.number().int().min(1).max(50), focus: focusSchema })
          .strict(),
      )
      .max(50),
  })
  .strict();

const practiceTip: Record<Focus, string> = {
  DIAGNOSTIC_EVIDENCE:
    "先独立作答，借这道题确认哪些步骤已经理解、哪些还需要练习。",
  LOW_MASTERY: "作答后对照解析，找出从哪一步开始偏离，再练一道同知识点的题。",
  PREREQUISITE_GAP: "如果卡在第一步，先回看相关先修知识，再回到本题。",
  CORE_CONCEPT: "作答后试着用自己的话说明这个核心概念在题目中是怎么用的。",
  TEACHER_PRIORITY: "做完这道教师标记的重点题后，对照解析复盘自己的步骤。",
};

export interface CourseRecommendationFocusInput {
  items: Array<{ key: number; type: QuestionType; focuses: Focus[] }>;
}

interface Candidate {
  id: string;
  reason: string;
  reasonCodes: string[];
  question: { type: QuestionType };
}

export function prepareCourseRecommendationFocus(
  candidates: readonly Candidate[],
) {
  const items = candidates.slice(0, 50).flatMap((candidate, index) => {
    const focuses = candidate.reasonCodes.flatMap((code) => {
      const parsed = focusSchema.safeParse(code);
      return parsed.success ? [parsed.data] : [];
    });
    return focuses.length
      ? [{ key: index + 1, type: candidate.question.type, focuses }]
      : [];
  });
  return {
    input: { items } satisfies CourseRecommendationFocusInput,
    apply(raw: unknown) {
      const result = outputSchema.safeParse(raw);
      const reasons = new Map<string, string>();
      if (!result.success) return reasons;
      const duplicates = new Set<number>();
      const seen = new Set<number>();
      for (const choice of result.data.items) {
        if (seen.has(choice.key)) duplicates.add(choice.key);
        seen.add(choice.key);
      }
      const options = new Map(items.map((item) => [item.key, item.focuses]));
      for (const choice of result.data.items) {
        if (
          duplicates.has(choice.key) ||
          !options.get(choice.key)?.includes(choice.focus)
        )
          continue;
        const candidate = candidates[choice.key - 1];
        reasons.set(candidate.id, candidate.reason + practiceTip[choice.focus]);
      }
      return reasons;
    },
  };
}
