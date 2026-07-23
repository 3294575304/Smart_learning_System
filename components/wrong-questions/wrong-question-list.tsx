import { BookOpenCheck } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { MasteryToggleButton } from "@/components/wrong-questions/mastery-toggle-button";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import type { WrongQuestionListItem } from "@/services/wrong-questions/types";

function sourceHref(item: WrongQuestionListItem): string {
  return item.sourceType === "ASSIGNMENT"
    ? `/student/submissions/${item.sourceRecordId}/result`
    : `/student/recommendations/${item.sourceRecordId}`;
}

export function WrongQuestionList({
  items,
  hasFilters,
}: {
  items: WrongQuestionListItem[];
  hasFilters: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        action={
          hasFilters ? (
            <Link
              className="text-sm font-medium underline"
              href="/student/wrong-questions"
            >
              清除筛选
            </Link>
          ) : (
            <Link
              className="text-sm font-medium underline"
              href="/student/assignments"
            >
              查看我的作业
            </Link>
          )
        }
        description={
          hasFilters
            ? "没有找到符合当前筛选条件的错题。"
            : "完成作业或推荐练习后，已经公开结果的错题会出现在这里。"
        }
        icon={BookOpenCheck}
        title={hasFilters ? "没有匹配的错题" : "错题本还是空的"}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => (
        <article
          className="flex min-w-0 flex-col rounded-xl border bg-white p-5"
          key={item.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-gray-100 px-2.5 py-1">
                  {QUESTION_TYPE_LABELS[item.type]}
                </span>
                <span
                  className={
                    item.isMastered
                      ? "rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800"
                      : "rounded-full bg-amber-100 px-2.5 py-1 text-amber-800"
                  }
                >
                  {item.isMastered ? "已掌握" : "未掌握"}
                </span>
              </div>
              <h2 className="mt-3 font-semibold break-words">{item.title}</h2>
            </div>
            <span className="shrink-0 text-sm font-medium text-red-700">
              错误 {item.wrongCount} 次
            </span>
          </div>

          <p className="text-muted-foreground mt-3 text-sm leading-6 break-words">
            {item.summary}
          </p>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-md bg-gray-50 p-3">
              <dt className="text-muted-foreground text-xs">最近错误答案</dt>
              <dd className="mt-1 line-clamp-3 whitespace-pre-wrap">
                {item.recentWrongAnswer}
              </dd>
            </div>
            <div className="rounded-md bg-gray-50 p-3">
              <dt className="text-muted-foreground text-xs">最近错误时间</dt>
              <dd className="mt-1">
                {item.lastWrongAt.toLocaleString("zh-CN")}
              </dd>
            </div>
          </dl>

          <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
            <span>
              知识点：
              {item.knowledgePoints.length > 0
                ? item.knowledgePoints.map((point) => point.name).join("、")
                : "未关联"}
            </span>
            <Link className="underline" href={sourceHref(item)}>
              来源：{item.sourceLabel}
            </Link>
          </div>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
            <Link
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50"
              href={`/student/wrong-questions/${item.id}`}
            >
              查看详情与重新练习
            </Link>
            <MasteryToggleButton
              compact
              initialIsMastered={item.isMastered}
              wrongQuestionId={item.id}
            />
          </div>
        </article>
      ))}
    </div>
  );
}
