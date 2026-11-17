import type { RecommendationDetailView } from "@/services/recommendations/types";
import { QuestionText } from "@/components/assignments/question-text";
import { AnswerQuestionHeading } from "@/components/assignments/student-answer-workspace";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { PracticeChoiceReview } from "./practice-choice-review";
import {
  practiceDraftFilled,
  type PracticeDraft,
} from "@/services/practice-sets/submission";

/** History uses stored content and the learner's own answer, without any write controls. */
export function PracticeHistoryQuestion({
  item,
  draft,
  embedded = false,
}: {
  item: RecommendationDetailView;
  draft?: PracticeDraft;
  embedded?: boolean;
}) {
  const answer = item.practiceResult?.answers[0] ?? item.historyFeedback;
  const ownAnswer = answer?.studentAnswer ?? item.savedAnswer;
  const showDraft =
    draft &&
    !answer &&
    ownAnswer == null &&
    item.status !== "COMPLETED" &&
    !item.programmingAttempt &&
    practiceDraftFilled(draft);
  const draftText = showDraft
    ? draft.kind === "CHOICE"
      ? draft.optionIds
          .map(
            (id) =>
              item.options.find((option) => option.id === id)?.label ??
              "原选项",
          )
          .join("、")
      : draft.kind === "BOOLEAN"
        ? draft.value
          ? "正确"
          : "错误"
        : draft.value
    : null;
  const title = item.title || "题目标题未保存";
  const status = (
    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
      {item.status === "COMPLETED"
        ? "已完成"
        : item.status === "EXPIRED"
          ? "已过期"
          : "已结束"}{" "}
      · 只读
    </span>
  );
  return (
    <article
      className={
        "min-w-0 space-y-4" +
        (embedded ? "" : " rounded-xl border bg-white p-5 sm:p-6")
      }
      aria-label="历史题目只读回看"
    >
      {embedded ? (
        <AnswerQuestionHeading
          title={title}
          type={QUESTION_TYPE_LABELS[item.type]}
          points={item.assignedPoints}
          detail={
            item.knowledgePoints.length > 0 && (
              <span className="[overflow-wrap:anywhere]">
                知识点 ·{" "}
                {item.knowledgePoints.map((point) => point.name).join("、")}
              </span>
            )
          }
          actions={status}
        />
      ) : (
        <header className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] break-words">
            {title}
          </h2>
          {status}
        </header>
      )}
      <QuestionText
        text={item.content || "未保存题目内容，暂时无法回看题干。"}
      />
      {item.options.length ? (
        <PracticeChoiceReview
          options={item.options}
          feedback={answer?.choiceFeedback}
        />
      ) : null}
      {answer?.choiceFeedback && (
        <div className="border-s-2 border-cyan-800 ps-3 text-sm">
          <h3 className="font-semibold">答案解析</h3>
          <QuestionText text={answer.explanation || "未保存解析"} />
        </div>
      )}
      {!answer?.choiceFeedback && (
        <section className="rounded-lg bg-sky-50 p-4 text-sm">
          <h3 className="font-medium">
            {showDraft ? "未提交草稿" : "你的答案"}
          </h3>
          <p className="mt-2 [overflow-wrap:anywhere] break-words whitespace-pre-wrap">
            {draftText ?? ownAnswer ?? "未作答，未保存答案。"}
          </p>
        </section>
      )}
      {answer ? (
        <section className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
          <h3 className="font-medium">已有反馈</h3>
          <p>
            本题得分 {answer.score}／{answer.maxScore}
          </p>
          {!answer.choiceFeedback && (
            <p className="[overflow-wrap:anywhere] break-words whitespace-pre-wrap">
              参考答案：{answer.correctAnswer || "未保存"}
            </p>
          )}
          {!answer.choiceFeedback && (
            <QuestionText text={answer.explanation || "未保存解析"} />
          )}
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
