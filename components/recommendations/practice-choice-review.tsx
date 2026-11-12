import type {
  RecommendationDetailView,
  RecommendationPracticeAnswerResultView,
} from "@/services/recommendations/types";

export function PracticeChoiceReview({
  options,
  feedback,
}: {
  options: RecommendationDetailView["options"];
  feedback?: RecommendationPracticeAnswerResultView["choiceFeedback"];
}) {
  return (
    <ul className="space-y-2" aria-label="题目选项">
      {options.map((option) => {
        const selected = feedback?.selectedOptionIds.includes(option.id);
        const correct = feedback?.correctOptionIds.includes(option.id);
        const tone = correct
          ? "border-emerald-700 bg-emerald-50"
          : selected
            ? "border-red-700 bg-red-50"
            : "border-slate-200 bg-white";
        return (
          <li
            key={option.id}
            className={`flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-sm ${tone}`}
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current text-xs font-semibold">
              {option.label}
            </span>
            <span className="min-w-0 flex-1 [overflow-wrap:anywhere] whitespace-pre-wrap">
              {option.content}
            </span>
            {(selected || correct) && (
              <span
                className={`text-xs font-medium ${correct ? "text-emerald-900" : "text-red-900"}`}
              >
                {selected && "你的选择"}
                {selected && correct && " · "}
                {correct && "正确答案"}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
