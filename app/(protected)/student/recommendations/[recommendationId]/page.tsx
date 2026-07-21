import { RecommendationStatus, Role } from "@prisma/client";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  difficultyLabel,
  formatRecommendationTime,
  questionTypeLabel,
  RECOMMENDATION_STATUS_LABELS,
  RECOMMENDATION_STATUS_STYLES,
} from "@/components/recommendations/recommendation-presenters";
import { StartRecommendationButton } from "@/components/recommendations/start-recommendation-button";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { getRecommendationDetail } from "@/services/recommendations/service";

interface Props {
  params: Promise<{ recommendationId: string }>;
}

export default async function RecommendationDetailPage({ params }: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const { recommendationId } = await params;
  try {
    const recommendation = await getRecommendationDetail(
      student,
      recommendationId,
    );
    const canPractice =
      recommendation.status === RecommendationStatus.PENDING ||
      recommendation.status === RecommendationStatus.STARTED;

    return (
      <section className="min-w-0 space-y-6">
        <header className="min-w-0">
          <Link
            className="text-sm text-gray-500 hover:underline"
            href="/student/recommendations"
          >
            ← 返回推荐列表
          </Link>
          <div className="mt-3 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold break-words">
                {recommendation.title}
              </h1>
              <p className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border px-2 py-1">
                  {questionTypeLabel(recommendation.type)}
                </span>
                <span className="rounded-full border px-2 py-1">
                  难度：{difficultyLabel(recommendation.difficulty)}
                </span>
              </p>
            </div>
            <span
              className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs ${RECOMMENDATION_STATUS_STYLES[recommendation.status]}`}
            >
              {RECOMMENDATION_STATUS_LABELS[recommendation.status]}
            </span>
          </div>
        </header>

        <article className="min-w-0 rounded-xl border bg-white p-4 sm:p-6">
          <h2 className="font-semibold">题目</h2>
          <p className="mt-4 text-sm leading-7 break-words whitespace-pre-wrap">
            {recommendation.content}
          </p>
          {recommendation.options.length > 0 ? (
            <ol className="mt-5 space-y-2">
              {recommendation.options.map((option) => (
                <li
                  className="min-w-0 rounded-md border p-3 text-sm break-words"
                  key={option.id}
                >
                  <strong>{option.label}.</strong> {option.content}
                </li>
              ))}
            </ol>
          ) : null}
        </article>

        <section className="min-w-0 rounded-xl border bg-white p-4 sm:p-6">
          <h2 className="font-semibold">为什么推荐这道题</h2>
          <p className="mt-3 text-sm leading-7 break-words whitespace-pre-wrap text-gray-700">
            {recommendation.reason}
          </p>
          <h3 className="mt-5 text-sm font-medium">知识点</h3>
          {recommendation.knowledgePoints.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">暂未关联知识点</p>
          ) : (
            <ul className="mt-2 flex min-w-0 flex-wrap gap-2">
              {recommendation.knowledgePoints.map((knowledgePoint) => (
                <li
                  className="max-w-full rounded-md bg-gray-100 px-2 py-1 text-xs break-words"
                  key={knowledgePoint.id}
                >
                  {knowledgePoint.name}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 border-t pt-4 text-xs text-gray-500">
            <p>
              推荐时间：{formatRecommendationTime(recommendation.createdAt)}
            </p>
            <p className="mt-1">
              有效期：
              {recommendation.expiresAt
                ? formatRecommendationTime(recommendation.expiresAt)
                : "长期有效"}
            </p>
          </div>
        </section>

        {canPractice ? (
          <StartRecommendationButton
            recommendationId={recommendation.id}
            status={recommendation.status}
          />
        ) : (
          <p className="rounded-lg bg-gray-100 p-4 text-sm text-gray-600">
            当前推荐状态不能开始或继续练习。
          </p>
        )}
      </section>
    );
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    if (error instanceof AuthorizationError) redirect("/403");
    throw error;
  }
}
