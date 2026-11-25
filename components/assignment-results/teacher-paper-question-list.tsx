"use client";

import type { QuestionType } from "@prisma/client";
import type { ReactNode } from "react";
import { ReadOnlyAnswerCard } from "@/components/assignments/read-only-answer-card";

/**
 * 教师查看作业内容的题目列表。
 *
 * 只要作业是「布置题目」形式，不论类别（平时表现 / 课程作业 / 课程实验）
 * 或是否来自考试场次，都在右侧给出答题卡，题号与正文顺序一一对应。
 */
export function TeacherPaperQuestionList({
  questions,
}: {
  questions: {
    id: string;
    order: number;
    type: QuestionType;
    points: number;
    content: ReactNode;
  }[];
}) {
  const totalPoints = questions.reduce(
    (sum, question) => sum + question.points,
    0,
  );
  return (
    <>
      <div className="min-w-0 space-y-3">
        {questions.map((question) => (
          <div
            key={question.id}
            id={`paper-question-${question.id}`}
            tabIndex={-1}
            className="scroll-mt-20 rounded-xl focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:outline-none"
          >
            {question.content}
          </div>
        ))}
      </div>
      <ReadOnlyAnswerCard
        plainNumbers
        totalPoints={totalPoints}
        questions={questions.map((question) => ({
          id: question.id,
          sortOrder: question.order,
          type: question.type,
          targetId: `paper-question-${question.id}`,
        }))}
      />
    </>
  );
}
