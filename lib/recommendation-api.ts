import { apiError } from "@/lib/api-response";
import {
  getRecommendationErrorStatus,
  getRecommendationSafeErrorMessage,
} from "@/services/recommendations/errors";

export function recommendationApiError(error: unknown) {
  const status = getRecommendationErrorStatus(error);
  if (status === 500) {
    console.error("Recommendation API request failed", error);
  }
  return apiError(getRecommendationSafeErrorMessage(error), status);
}
