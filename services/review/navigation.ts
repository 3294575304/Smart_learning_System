import { favoriteQuerySchema } from "@/services/question-favorites/schemas";
import { wrongQuestionListQuerySchema } from "@/services/wrong-questions/schemas";
export function reviewReturnUrl(value: string | undefined, favorites = false) {
  const fallback = `/student/wrong-questions?view=${favorites ? "favorites" : "wrong"}`;
  if (!value?.startsWith("/student/wrong-questions?") || value.includes("\\"))
    return fallback;
  try {
    const url = new URL(value, "https://review.invalid");
    if (
      url.origin !== "https://review.invalid" ||
      url.pathname !== "/student/wrong-questions"
    )
      return fallback;
    const input = Object.fromEntries(url.searchParams);
    const isFavorites = input.view === "favorites";
    delete input.view;
    if (isFavorites) {
      if (input.keyword) {
        input.search = input.keyword;
        delete input.keyword;
      }
      if (!favoriteQuerySchema.safeParse(input).success) return fallback;
    } else {
      if (input.isMastered === "all") delete input.isMastered;
      if (!wrongQuestionListQuerySchema.safeParse(input).success)
        return fallback;
    }
    return `/student/wrong-questions?${url.searchParams}`;
  } catch {
    return fallback;
  }
}
