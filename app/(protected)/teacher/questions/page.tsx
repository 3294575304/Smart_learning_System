import { Role } from "@prisma/client";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { QuestionFilters } from "@/components/questions/question-filters";
import { QuestionList } from "@/components/questions/question-list";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  questionListQuerySchema,
  type QuestionListQuery,
} from "@/services/questions/schemas";
import {
  listKnowledgePointOptions,
  listTeacherQuestions,
} from "@/services/questions/service";

interface QuestionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValues(values: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function pageHref(query: QuestionListQuery, page: number): string {
  const params = new URLSearchParams({
    scope: query.scope,
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.type) params.set("type", query.type);
  if (query.difficulty) params.set("difficulty", String(query.difficulty));
  if (query.knowledgePointId)
    params.set("knowledgePointId", query.knowledgePointId);
  return `/teacher/questions?${params.toString()}`;
}

function visiblePageNumbers(currentPage: number, totalPages: number) {
  const current = Math.min(Math.max(currentPage, 1), totalPages);
  const pages = new Set([1, totalPages]);
  for (
    let page = Math.max(1, current - 1);
    page <= Math.min(totalPages, current + 1);
    page += 1
  ) {
    pages.add(page);
  }
  return [...pages].sort((left, right) => left - right);
}

export default async function QuestionsPage({
  searchParams,
}: QuestionsPageProps) {
  const teacher = await requirePageRole(Role.TEACHER);
  const parsed = questionListQuerySchema.safeParse(
    firstValues(await searchParams),
  );
  const query = parsed.success
    ? parsed.data
    : questionListQuerySchema.parse({});
  const [questions, knowledgePoints] = await Promise.all([
    listTeacherQuestions(teacher.id, query),
    listKnowledgePointOptions(),
  ]);

  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
            href="/teacher/questions/new"
          >
            <Plus className="h-4 w-4" />
            创建题目
          </Link>
        }
        description="搜索和筛选自己的题目，或从公共题库复制后再编辑。"
        title="教师题库"
      />
      <QuestionFilters knowledgePoints={knowledgePoints} query={query} />
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {questions.pagination.total} 道题</span>
        <span aria-live="polite">
          第 {questions.pagination.page} /{" "}
          {Math.max(questions.pagination.totalPages, 1)} 页
        </span>
      </div>
      <QuestionList items={questions.items} />
      {questions.pagination.totalPages > 1 ? (
        <nav
          aria-label="题库分页"
          className="flex flex-wrap items-center justify-center gap-1.5"
        >
          {questions.pagination.page > 1 ? (
            <Link
              aria-label="上一页"
              className="inline-flex size-9 items-center justify-center rounded-md border bg-white text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              href={pageHref(query, questions.pagination.page - 1)}
              title="上一页"
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
          {visiblePageNumbers(
            questions.pagination.page,
            questions.pagination.totalPages,
          ).map((page, index, pages) => {
            const previousPage = pages[index - 1];
            const hasGap =
              previousPage !== undefined && page - previousPage > 1;
            return (
              <span className="contents" key={page}>
                {hasGap ? (
                  <span
                    aria-hidden="true"
                    className="inline-flex size-9 items-center justify-center text-sm text-gray-400"
                  >
                    …
                  </span>
                ) : null}
                <Link
                  aria-current={
                    page === questions.pagination.page ? "page" : undefined
                  }
                  aria-label={`第 ${page} 页`}
                  className={`inline-flex size-9 items-center justify-center rounded-md border text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                    page === questions.pagination.page
                      ? "border-sky-600 bg-sky-600 text-white"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                  }`}
                  href={pageHref(query, page)}
                >
                  {page}
                </Link>
              </span>
            );
          })}
          {questions.pagination.page < questions.pagination.totalPages ? (
            <Link
              aria-label="下一页"
              className="inline-flex size-9 items-center justify-center rounded-md border bg-white text-gray-700 transition hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              href={pageHref(query, questions.pagination.page + 1)}
              title="下一页"
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
