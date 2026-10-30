import { StudentBackLink } from "@/components/dashboard/student-back-link";
import { reviewReturnUrl } from "@/services/review/navigation";
import { Role } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { FavoriteButton } from "@/components/question-favorites/favorite-button";
import { FavoritePracticeButton } from "@/components/question-favorites/favorite-practice-button";
import { questionTypeLabel } from "@/components/recommendations/recommendation-presenters";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  AuthorizationError,
  ResourceNotFoundError,
} from "@/services/auth/policy";
import { getFavoriteDetail } from "@/services/question-favorites/service";
export default async function FavoriteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ questionId: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const student = await requirePageRole(Role.STUDENT);
  const returnTo = reviewReturnUrl((await searchParams).returnTo, true);
  try {
    const detail = await getFavoriteDetail(student, (await params).questionId);
    const { favorite, question } = detail;
    return (
      <section className="space-y-5">
        <StudentBackLink href={returnTo}>返回我的收藏</StudentBackLink>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">
              {favorite.courseName} · {questionTypeLabel(favorite.type)}
            </p>
            <h1 className="mt-2 text-2xl font-semibold">{favorite.title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {favorite.knowledgePoints.map((item) => item.name).join(" · ")}
            </p>
          </div>
          <FavoriteButton
            questionId={favorite.questionId}
            source={favorite.source}
            initialFavorited
          />
        </header>
        {favorite.note && (
          <p className="rounded-xl border bg-amber-50 p-4 text-sm whitespace-pre-wrap">
            我的备注：{favorite.note}
          </p>
        )}
        {question ? (
          <article className="space-y-4 rounded-xl border bg-white p-5">
            <p className="text-sm leading-7 whitespace-pre-wrap">
              {question.content}
            </p>
            <ol className="space-y-2">
              {question.options.map((option) => (
                <li key={option.id} className="rounded-lg border p-3 text-sm">
                  <strong>{option.label}. </strong>
                  {option.content}
                </li>
              ))}
            </ol>
          </article>
        ) : (
          <p className="rounded-xl border bg-amber-50 p-5 text-sm text-amber-800">
            暂不可练习：{favorite.unavailableReason}
            。保留收藏标题和个人备注，供你整理学习记录。
          </p>
        )}
        <FavoritePracticeButton
          questionId={favorite.questionId}
          disabled={!favorite.available}
        />
        <p className="text-xs text-slate-500">
          收藏不改变掌握度。实际提交练习后沿用系统判分和学习记录，不计入正式课程成绩。
        </p>
      </section>
    );
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    if (error instanceof AuthorizationError) redirect("/403");
    throw error;
  }
}
