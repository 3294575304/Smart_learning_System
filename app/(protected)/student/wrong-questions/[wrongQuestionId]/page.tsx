import { Role } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MasteryToggleButton } from "@/components/wrong-questions/mastery-toggle-button";
import { WrongQuestionPractice } from "@/components/wrong-questions/wrong-question-practice";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { getWrongQuestionDetail } from "@/services/wrong-questions/service";

interface Props {
  params: Promise<{ wrongQuestionId: string }>;
}

function sourceHref(sourceType: string, sourceRecordId: string): string {
  return sourceType === "ASSIGNMENT"
    ? `/student/submissions/${sourceRecordId}/result`
    : `/student/recommendations/${sourceRecordId}`;
}

export default async function StudentWrongQuestionDetailPage({
  params,
}: Props) {
  const student = await requirePageRole(Role.STUDENT);
  try {
    const detail = await getWrongQuestionDetail(
      student.id,
      (await params).wrongQuestionId,
    );
    return (
      <section className="space-y-6">
        <header>
          <Link
            className="text-muted-foreground text-sm hover:underline"
            href="/student/wrong-questions"
          >
            ← 返回错题本
          </Link>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-gray-100 px-2.5 py-1">
                  {QUESTION_TYPE_LABELS[detail.type]}
                </span>
                <span
                  className={
                    detail.isMastered
                      ? "rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800"
                      : "rounded-full bg-amber-100 px-2.5 py-1 text-amber-800"
                  }
                >
                  {detail.isMastered ? "已掌握" : "未掌握"}
                </span>
              </div>
              <h1 className="mt-3 text-2xl font-semibold break-words">
                {detail.title}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                错误 {detail.wrongCount} 次 · 最近错误于{" "}
                {detail.lastWrongAt.toLocaleString("zh-CN")}
              </p>
            </div>
            <MasteryToggleButton
              initialIsMastered={detail.isMastered}
              wrongQuestionId={detail.id}
            />
          </div>
        </header>

        <article className="space-y-5 rounded-xl border bg-white p-5 sm:p-6">
          <section>
            <h2 className="text-sm font-semibold">题目内容</h2>
            <p className="mt-2 leading-7 whitespace-pre-wrap">
              {detail.content}
            </p>
          </section>
          {detail.options.length > 0 ? (
            <ol className="space-y-2">
              {detail.options.map((option) => (
                <li className="rounded-md border p-3 text-sm" key={option.id}>
                  <strong>{option.label}.</strong> {option.content}
                </li>
              ))}
            </ol>
          ) : null}
          <dl className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-red-50 p-4">
              <dt className="text-sm font-medium text-red-900">
                最近一次错误答案
              </dt>
              <dd className="mt-2 text-sm whitespace-pre-wrap text-red-950">
                {detail.recentWrongAnswer}
              </dd>
            </div>
            <div className="rounded-lg bg-emerald-50 p-4">
              <dt className="text-sm font-medium text-emerald-900">
                正确 / 参考答案
              </dt>
              <dd className="mt-2 text-sm whitespace-pre-wrap text-emerald-950">
                {detail.correctAnswer}
              </dd>
            </div>
          </dl>
          <section className="rounded-lg border-l-4 border-blue-300 bg-blue-50 p-4">
            <h2 className="text-sm font-semibold">答案解析</h2>
            <p className="mt-2 text-sm leading-6 whitespace-pre-wrap">
              {detail.explanation}
            </p>
          </section>
          <div className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-sm">
            <span>
              知识点：
              {detail.knowledgePoints.length > 0
                ? detail.knowledgePoints.map((point) => point.name).join("、")
                : "未关联"}
            </span>
            <Link
              className="underline"
              href={sourceHref(detail.sourceType, detail.sourceRecordId)}
            >
              查看来源：{detail.sourceLabel}
            </Link>
          </div>
        </article>
        <WrongQuestionPractice question={detail} />
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
