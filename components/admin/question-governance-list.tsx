import { BookOpenCheck } from "lucide-react";
import Link from "next/link";

import { QuestionGovernanceAction } from "@/components/admin/question-governance-action";
import { EmptyState } from "@/components/dashboard/empty-state";
import type { AdminQuestionView } from "@/services/admin/questions/types";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";

export function QuestionGovernanceList({
  questions,
}: {
  questions: AdminQuestionView[];
}) {
  if (questions.length === 0) {
    return (
      <EmptyState
        description="调整筛选条件后重试。"
        icon={BookOpenCheck}
        title="没有找到题目"
      />
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">题目</th>
            <th className="px-4 py-3 font-medium">题型/难度</th>
            <th className="px-4 py-3 font-medium">知识点</th>
            <th className="px-4 py-3 font-medium">来源</th>
            <th className="px-4 py-3 font-medium">状态</th>
            <th className="px-4 py-3 font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {questions.map((question) => (
            <tr key={question.id}>
              <td className="max-w-sm px-4 py-3">
                <Link
                  className="font-medium hover:underline"
                  href={`/admin/questions/${question.id}`}
                >
                  {question.title}
                </Link>
                <p className="text-muted-foreground mt-1 line-clamp-2">
                  {question.content}
                </p>
              </td>
              <td className="px-4 py-3">
                {QUESTION_TYPE_LABELS[question.type]} · {question.difficulty}
              </td>
              <td className="px-4 py-3">
                {question.knowledgePoints.map((point) => point.name).join("、")}
              </td>
              <td className="px-4 py-3">
                <p>{question.creator.displayName}</p>
                <p className="text-muted-foreground text-xs">
                  {question.source === "ADMIN" ? "管理员来源" : "教师历史来源"}
                </p>
              </td>
              <td className="px-4 py-3">
                <p>{question.visibility === "PUBLIC" ? "公共" : "私有"}</p>
                <p className="text-muted-foreground text-xs">
                  {question.status === "ACTIVE" ? "正常" : "非活动"}
                </p>
              </td>
              <td className="px-4 py-3">
                <div className="space-y-2">
                  <Link
                    className="block text-sm underline underline-offset-4"
                    href={`/admin/questions/${question.id}`}
                  >
                    查看详情
                  </Link>
                  <QuestionGovernanceAction question={question} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
