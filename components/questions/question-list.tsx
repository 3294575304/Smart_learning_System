import Link from "next/link";
import { questionContentReview } from "@/services/questions/content-review";

import { QuestionActions } from "@/components/questions/question-actions";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { QuestionListItem } from "@/services/questions/types";

export function QuestionList({ items }: { items: QuestionListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">
        没有符合条件的题目。可以调整筛选条件，或批量导入题目。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((question) => (
        <article className="rounded-xl border bg-white p-5" key={question.id}>
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{QUESTION_TYPE_LABELS[question.type]}</span>
                <span>难度 {question.difficulty}</span>
                <span>{question.questionCategoryName ?? "待补课程分类"}</span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  {question.status === "ACTIVE"
                    ? "使用中"
                    : question.status === "DRAFT"
                      ? "草稿 · 待配置"
                      : question.status}
                </span>
                <span>创建者：{question.creator.displayName}</span>
              </div>
              <Link
                className="mt-2 block text-lg font-semibold hover:underline"
                href={`/teacher/questions/${question.id}`}
              >
                {question.title}
              </Link>
              <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                {question.content}
              </p>
              {questionContentReview(question.content).length > 0 && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                  待核对题干 ·{" "}
                  {questionContentReview(question.content).join("；")}
                  。点击题目标题查看并修正，历史作业快照保持不变。
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {!question.courseGraphConcepts ? (
                  <span className="text-xs text-slate-500">
                    选择课程后查看该课程的知识点分类
                  </span>
                ) : null}
                {(question.courseGraphConcepts ?? []).map((point) => (
                  <span
                    className="rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-700"
                    key={point.id}
                  >
                    {point.code} · {point.name}
                  </span>
                ))}
                {question.courseGraphConcepts?.length === 0 ? (
                  <span className="text-xs text-slate-500">
                    此题尚未绑定到所选课程
                  </span>
                ) : null}
                {question.tags.map((tag) => (
                  <span
                    className="rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-800"
                    key={tag}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
              {question.assignmentReferenceCount > 0 ? (
                <p className="mt-3 text-xs text-amber-700">
                  已被 {question.assignmentReferenceCount} 份作业引用
                </p>
              ) : null}
            </div>
            <QuestionActions compact questionId={question.id} />
          </div>
        </article>
      ))}
    </div>
  );
}
