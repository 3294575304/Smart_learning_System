import { Role } from "@prisma/client";
import Link from "next/link";

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
  if (query.type) params.set("type", query.type);
  if (query.difficulty) params.set("difficulty", String(query.difficulty));
  if (query.knowledgePointId)
    params.set("knowledgePointId", query.knowledgePointId);
  return `/teacher/questions?${params.toString()}`;
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            className="text-sm text-gray-500 hover:underline"
            href="/teacher"
          >
            ← 返回教师工作台
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">教师题库</h1>
          <p className="mt-2 text-sm text-gray-600">
            管理自己的题目，或从公共题库复制后再编辑。
          </p>
        </div>
        <Link
          className="rounded-md bg-black px-4 py-2 text-white"
          href="/teacher/questions/new"
        >
          创建题目
        </Link>
      </div>
      <QuestionFilters knowledgePoints={knowledgePoints} query={query} />
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {questions.pagination.total} 道题</span>
        <span>
          第 {questions.pagination.page} /{" "}
          {Math.max(questions.pagination.totalPages, 1)} 页
        </span>
      </div>
      <QuestionList items={questions.items} />
      {questions.pagination.totalPages > 1 ? (
        <nav className="flex justify-center gap-3">
          {query.page > 1 ? (
            <Link
              className="rounded-md border px-3 py-2"
              href={pageHref(query, query.page - 1)}
            >
              上一页
            </Link>
          ) : null}
          {query.page < questions.pagination.totalPages ? (
            <Link
              className="rounded-md border px-3 py-2"
              href={pageHref(query, query.page + 1)}
            >
              下一页
            </Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
