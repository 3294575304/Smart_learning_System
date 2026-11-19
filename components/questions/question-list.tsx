import Link from "next/link";
import type { QuestionType } from "@prisma/client";
import {
  AlignLeft,
  ArrowUpRight,
  CircleDot,
  Code2,
  Link2,
  ListChecks,
  TextCursorInput,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react";
import { questionContentReview } from "@/services/questions/content-review";
import { QuestionActions } from "@/components/questions/question-actions";
import { QuestionObjectiveRetry } from "@/components/questions/question-objective-retry";
import {
  QUESTION_ORIGIN_LABELS,
  QUESTION_TYPE_LABELS,
} from "@/services/questions/constants";
import type { QuestionListItem } from "@/services/questions/types";

const TYPE_ICONS: Record<QuestionType, LucideIcon> = {
  SINGLE_CHOICE: CircleDot,
  MULTIPLE_CHOICE: ListChecks,
  TRUE_FALSE: ToggleLeft,
  FILL_BLANK: TextCursorInput,
  SHORT_ANSWER: AlignLeft,
  PYTHON_PROGRAMMING: Code2,
};

export function QuestionList({
  items,
  courseId = null,
}: {
  items: QuestionListItem[];
  courseId?: string | null;
}) {
  if (!items.length)
    return (
      <div className="text-muted-foreground rounded-xl border border-dashed p-10 text-center">
        没有符合条件的题目。可以调整筛选条件，或批量导入题目。
      </div>
    );
  return (
    <div className="tq-list">
      {items.map((question) => {
        const Icon = TYPE_ICONS[question.type];
        const review = questionContentReview(question.content);
        const href = `/teacher/questions/${question.id}`;
        return (
          <article
            className="tq-card"
            key={question.id}
            data-question-type={question.type}
          >
            <div className="tq-main">
              <span className="tq-type-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="tq-body">
                <div className="tq-meta">
                  <span className="tq-type-label">
                    {QUESTION_TYPE_LABELS[question.type]}
                  </span>
                  <span className="tq-status" data-status={question.status}>
                    <i aria-hidden="true" />
                    {question.status === "ACTIVE"
                      ? "使用中"
                      : question.status === "DRAFT"
                        ? "草稿 · 待配置"
                        : "已归档"}
                  </span>
                  <span className="tq-objective">
                    课程目标：
                    {question.courseObjectives?.length
                      ? question.courseObjectives
                          .map(({ code, title }) => `${code} · ${title}`)
                          .join(" / ")
                      : question.courseObjectives !== undefined
                        ? "待分类"
                        : question.defaultObjectiveKind === "KNOWLEDGE"
                          ? "1 · 知识"
                          : question.defaultObjectiveKind === "ABILITY"
                            ? "2 · 能力"
                            : question.defaultObjectiveKind === "LITERACY"
                              ? "3 · 素养"
                              : "待分类"}
                  </span>
                  {(question.courseObjectives?.length === 0 ||
                    (question.courseObjectives === undefined &&
                      !question.defaultObjectiveKind)) && (
                    <QuestionObjectiveRetry
                      questionId={question.id}
                      courseId={
                        question.courseObjectives?.length === 0
                          ? courseId
                          : null
                      }
                    />
                  )}
                  {question.origin !== "MANUAL" ? (
                    <span className="tq-source">
                      {QUESTION_ORIGIN_LABELS[question.origin]}
                    </span>
                  ) : null}
                </div>
                <Link className="tq-title" href={href}>
                  {question.title}
                </Link>
                <p className="tq-stem">{question.content}</p>
                {review.length > 0 ? (
                  <p className="tq-warning">
                    待核对题干 · {review.join("；")}
                    。点击题目标题查看并修正，历史作业快照保持不变。
                  </p>
                ) : null}
                {Boolean(question.courseGraphConcepts?.length) ||
                question.tags.length > 0 ? (
                  <div className="tq-tags">
                    {Boolean(question.courseGraphConcepts?.length) ? (
                      <span className="tq-tag-label">课程知识点</span>
                    ) : null}
                    {(question.courseGraphConcepts ?? []).map((point) => (
                      <span className="tq-tag" key={point.id}>
                        {point.code} · {point.name}
                      </span>
                    ))}
                    {question.tags.length > 0 ? (
                      <span className="tq-tag-label">标签</span>
                    ) : null}
                    {question.tags.map((tag) => (
                      <span className="tq-tag" key={tag}>
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
                {!question.courseGraphConcepts ? (
                  <p className="tq-scope-note">
                    选择课程后查看该课程的知识点分类
                  </p>
                ) : question.courseGraphConcepts.length === 0 ? (
                  <p className="tq-scope-note">此题尚未绑定到所选课程</p>
                ) : null}
              </div>
              <div className="tq-actions">
                <QuestionActions compact questionId={question.id} />
              </div>
            </div>
            <footer className="tq-footer">
              <div className="tq-provenance">
                <span>{question.questionCategoryName ?? "待补课程分类"}</span>
                <span>创建者：{question.creator.displayName ?? "未设置"}</span>
                {question.assignmentReferenceCount > 0 ? (
                  <span className="tq-reference">
                    <Link2 aria-hidden="true" />
                    已被 {question.assignmentReferenceCount} 份作业引用
                  </span>
                ) : null}
              </div>
              <Link className="tq-detail" href={href}>
                查看题目
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </footer>
          </article>
        );
      })}
    </div>
  );
}
