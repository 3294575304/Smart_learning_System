import Link from "next/link";

import { QuestionActions } from "@/components/questions/question-actions";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { QuestionListItem } from "@/services/questions/types";

export function QuestionList({ items }: { items: QuestionListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">
        没有符合条件的题目。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((question) => (
        <article className="rounded-xl border bg-white p-5" key={question.id}>
          <div className="flex flex-col justify-between gap-4 md:flex-row">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span>{QUESTION_TYPE_LABELS[question.type]}</span>
                <span>难度 {question.difficulty}</span>
                <span>
                  {question.visibility === "PUBLIC" ? "公开" : "私有"}
                </span>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                  {question.status === "ACTIVE" ? "使用中" : question.status}
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
              <div className="mt-3 flex flex-wrap gap-2">
                {question.knowledgePoints.map((point) => (
                  <span
                    className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700"
                    key={point.id}
                  >
                    {point.name}
                  </span>
                ))}
                {question.tags.map((tag) => (
                  <span
                    className="rounded-full bg-gray-100 px-2 py-1 text-xs"
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
            <QuestionActions
              compact
              canDelete={question.canDelete}
              canEdit={question.canEdit}
              questionId={question.id}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
