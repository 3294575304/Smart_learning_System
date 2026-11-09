import "server-only";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import { getSystemConfigValue } from "@/services/system-config/service";
import {
  COURSE_RECOMMENDATION_REASON_PROMPT_VERSION,
  prepareCourseRecommendationFocus,
} from "./reason-focus";

export async function enhanceNewCourseRecommendationReasons(
  studentId: string,
  cycleId: string,
  items: Parameters<typeof prepareCourseRecommendationFocus>[0],
) {
  const { input, apply } = prepareCourseRecommendationFocus(items);
  if (
    process.env.COURSE_RECOMMENDATION_AI_REASON_DISABLED === "true" ||
    !input.items.length
  )
    return new Map<string, string>();
  try {
    if (!(await getSystemConfigValue("aiAnalysisEnabled")))
      return new Map<string, string>();
    const provider = createAIProvider({
      capability: "recommend_explain",
      actorId: studentId,
      requestId: cycleId,
    });
    if (!provider.chooseCourseRecommendationReasonFocus)
      return new Map<string, string>();
    const reasons = apply(
      await provider.chooseCourseRecommendationReasonFocus(input, {
        signal: AbortSignal.timeout(2_500),
      }),
    );
    if (!reasons.size) return reasons;
    return await prisma.$transaction(async (tx) => {
      const accepted = new Map<string, string>();
      for (const [id, reason] of reasons) {
        const result = await tx.personalizedRecommendation.updateMany({
          where: {
            id,
            studentId,
            courseCycleId: cycleId,
            status: "PENDING",
            source: "RULE",
            reasonPromptVersion: null,
          },
          data: {
            reason,
            source: "HYBRID",
            reasonPromptVersion: COURSE_RECOMMENDATION_REASON_PROMPT_VERSION,
          },
        });
        if (result.count) accepted.set(id, reason);
      }
      return accepted;
    });
  } catch {
    console.warn("Course recommendation reason enhancement fell back", {
      cycleId,
    });
    return new Map<string, string>();
  }
}
