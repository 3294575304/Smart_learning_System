import { apiError } from "@/lib/api-response";
import {
  getRecommendationErrorStatus,
  getRecommendationSafeErrorMessage,
} from "@/services/recommendations/errors";

interface SafeRecommendationErrorLog {
  name: string;
  code?: string;
}

export function recommendationErrorLog(
  error: unknown,
): SafeRecommendationErrorLog {
  if (!(error instanceof Error)) return { name: "UnknownError" };
  const code = Reflect.get(error, "code");
  return {
    name: error.name || "Error",
    ...(typeof code === "string" ? { code } : {}),
  };
}

export function recommendationApiError(error: unknown) {
  const status = getRecommendationErrorStatus(error);
  if (status === 500) {
    console.error(
      "Recommendation API request failed",
      recommendationErrorLog(error),
    );
  }
  return apiError(getRecommendationSafeErrorMessage(error), status);
}
