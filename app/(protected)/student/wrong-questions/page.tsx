import { notFound } from "next/navigation";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { ReviewTabs } from "@/components/wrong-questions/review-tabs";
import { FavoriteCenter } from "@/components/question-favorites/favorite-center";
import { listReviewChapters } from "@/services/review/chapters";
import { Role } from "@prisma/client";

import { StudentPageHeader as PageHeader } from "@/components/dashboard/student-page-header";
import { WrongQuestionFilters } from "@/components/wrong-questions/wrong-question-filters";
import { WrongQuestionList } from "@/components/wrong-questions/wrong-question-list";
import { WrongQuestionPagination } from "@/components/wrong-questions/wrong-question-pagination";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  wrongQuestionListQuerySchema,
  type WrongQuestionListQuery,
} from "@/services/wrong-questions/schemas";
import { CourseReviewSummary } from "@/components/wrong-questions/course-review-summary";
import {
  summarizeWrongCourses,
  listWrongQuestions,
} from "@/services/wrong-questions/service";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValues(
  input: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
}

function hasActiveFilters(query: WrongQuestionListQuery): boolean {
  return Boolean(
    query.keyword ||
    query.classroomId ||
    query.courseId ||
    query.knowledgePointId ||
    query.chapterId ||
    query.type ||
    query.isMastered !== undefined ||
    query.recentDays,
  );
}

export default async function StudentWrongQuestionsPage({
  searchParams,
}: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const raw = firstValues(await searchParams);
  const favorites = raw.view === "favorites";
  const { view: _view, ...filters } = raw;
  void _view;
  const parsed = wrongQuestionListQuerySchema.safeParse(
    favorites ? {} : filters,
  );
  const query = parsed.success
    ? parsed.data
    : wrongQuestionListQuerySchema.parse({});
  let result: Awaited<ReturnType<typeof listWrongQuestions>>;
  let chapters: Awaited<ReturnType<typeof listReviewChapters>>;
  try {
    [result, chapters] = await Promise.all([
      listWrongQuestions(student.id, query),
      listReviewChapters(student.id, query.courseId),
    ]);
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }

  const courseSummaries = favorites
    ? []
    : await summarizeWrongCourses(student.id, query.courseId);

  return (
    <section className="space-y-4">
      <PageHeader
        description="整理错题和收藏，按课程与章节复习。收藏和掌握状态分别保存。"
        title="复习中心"
      />
      <ReviewTabs favorites={favorites} />
      {!parsed.success ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800"
        >
          筛选参数已失效，已恢复全部错题，请重新选择条件。
        </p>
      ) : null}
      {favorites ? (
        <FavoriteCenter enabled />
      ) : (
        <>
          <WrongQuestionFilters
            total={result.pagination.total}
            filterOptions={result.filterOptions}
            chapters={chapters}
            query={query}
          />
          <CourseReviewSummary
            key={query.courseId ?? "all"}
            summaries={courseSummaries}
          />
          <WrongQuestionList
            hasFilters={hasActiveFilters(query)}
            items={result.items}
          />
          <WrongQuestionPagination
            query={query}
            total={result.pagination.total}
            totalPages={result.pagination.totalPages}
          />
        </>
      )}
    </section>
  );
}
