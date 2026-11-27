import type { ReactNode } from "react";
import { QuestionText } from "@/components/assignments/question-text";

export const questionReviewAnswerLabels = {
  SINGLE_CHOICE: "标准答案",
  MULTIPLE_CHOICE: "标准答案",
  TRUE_FALSE: "标准答案",
  FILL_BLANK: "可接受答案",
  SHORT_ANSWER: "参考答案",
  PYTHON_PROGRAMMING: "判分依据",
};

interface ReviewOption {
  id: string;
  label: string;
  content: string;
  isCorrect: boolean;
}

export function QuestionReviewContent({
  content,
  stemMedia,
  options,
  explanation,
  answer,
  heading = "h2",
}: {
  content: string;
  stemMedia?: ReactNode;
  options: readonly ReviewOption[];
  explanation: string | null | undefined;
  answer?: { label: string; value: string; note?: string };
  heading?: "h2" | "h3";
}) {
  const Heading = heading;
  return (
    <div className="min-w-0 space-y-6">
      <section>
        <Heading className="font-semibold">题干</Heading>
        <div className="mt-2">
          <QuestionText text={content} />
          {stemMedia}
        </div>
      </section>
      {options.length > 0 && (
        <section>
          <Heading className="font-semibold">选项</Heading>
          <ul className="mt-2 space-y-2">
            {options.map((option) => (
              <li
                key={option.id}
                className={`min-w-0 rounded-md border p-3 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap ${option.isCorrect ? "border-green-500 bg-green-50" : "bg-card"}`}
              >
                <span className="font-medium">{option.label}.</span>{" "}
                {option.content}
                {option.isCorrect && (
                  <span className="ms-2 inline-block text-xs font-medium text-green-700">
                    正确答案
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {answer && (
        <section>
          <Heading className="font-semibold">{answer.label}</Heading>
          <div className="mt-2">
            <QuestionText text={answer.value} />
          </div>
          {answer.note && (
            <p className="text-muted-foreground mt-1 text-xs">{answer.note}</p>
          )}
        </section>
      )}
      <section>
        <Heading className="font-semibold">答案解析</Heading>
        <div className="mt-2">
          <QuestionText text={explanation?.trim() ? explanation : "暂无解析"} />
        </div>
      </section>
    </div>
  );
}
