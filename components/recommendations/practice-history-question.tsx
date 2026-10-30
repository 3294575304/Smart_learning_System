import type { RecommendationDetailView } from "@/services/recommendations/types";

/** History uses stored content and the learner's own answer, without any write controls. */
export function PracticeHistoryQuestion({
  item,
}: {
  item: RecommendationDetailView;
}) {
  const answer = item.practiceResult?.answers[0] ?? item.historyFeedback;
  const ownAnswer = answer?.studentAnswer ?? item.savedAnswer;
  return (
    <article
      className="min-w-0 space-y-5 rounded-xl border bg-white p-5 sm:p-6"
      aria-label="历史题目只读回看"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] break-words">
          {item.title || "题目标题未保存"}
        </h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          {item.status === "COMPLETED"
            ? "已完成"
            : item.status === "EXPIRED"
              ? "已过期"
              : "已结束"}{" "}
          · 只读
        </span>
      </header>
      <p className="[overflow-wrap:anywhere] break-words whitespace-pre-wrap">
        {item.content || "未保存题目内容，暂时无法回看题干。"}
      </p>
      {item.options.length ? (
        <ul className="space-y-2 text-sm">
          {item.options.map((option) => (
            <li
              className="rounded-lg border p-3 [overflow-wrap:anywhere] break-words"
              key={option.id}
            >
              {option.label}. {option.content}
            </li>
          ))}
        </ul>
      ) : null}
      <section className="rounded-lg bg-sky-50 p-4 text-sm">
        <h3 className="font-medium">你的答案</h3>
        <p className="mt-2 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
          {ownAnswer ?? "未作答，未保存答案。"}
        </p>
      </section>
      {answer ? (
        <section className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
          <h3 className="font-medium">已有反馈</h3>
          <p>
            本题得分 {answer.score}／{answer.maxScore}
          </p>
          <p className="[overflow-wrap:anywhere] break-words whitespace-pre-wrap">
            参考答案：{answer.correctAnswer || "未保存"}
          </p>
          <p className="[overflow-wrap:anywhere] break-words whitespace-pre-wrap">
            {answer.explanation || "未保存解析"}
          </p>
        </section>
      ) : (
        <p className="text-sm text-slate-500">
          暂无已评反馈；未作答和未判定不计为零分。
        </p>
      )}
      <p className="text-xs text-slate-400">
        题目内容来自现存记录，未保存的历史内容无法恢复。历史记录仅供回看。
      </p>
    </article>
  );
}
