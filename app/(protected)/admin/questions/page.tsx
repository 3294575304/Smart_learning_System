import { Role } from "@prisma/client";
import { FileUp } from "lucide-react";
import Link from "next/link";
import { QuestionGovernanceFilters } from "@/components/admin/question-governance-filters";
import { QuestionGovernanceList } from "@/components/admin/question-governance-list";
import { PageHeader } from "@/components/dashboard/page-header";
import { PageIndex } from "@/components/dashboard/page-index";
import {
  adminQuestionListQuerySchema,
  type AdminQuestionListQuery,
} from "@/services/admin/questions/schemas";
import {
  listAdminQuestionCreators,
  listAdminQuestions,
} from "@/services/admin/questions/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import { listQuestionImportCourses } from "@/services/question-import/courses";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValues(values: Record<string, string | string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
}

function pageHref(query: AdminQuestionListQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  for (const key of [
    "keyword",
    "type",
    "knowledgePointId",
    "courseId",
    "creatorId",
    "visibility",
    "status",
  ] as const) {
    const value = query[key];
    if (value) params.set(key, String(value));
  }
  return `/admin/questions?${params.toString()}`;
}

export default async function AdminQuestionsPage({ searchParams }: PageProps) {
  await requirePageRole(Role.ADMIN);
  const parsed = adminQuestionListQuerySchema.safeParse(
    firstValues(await searchParams),
  );
  const query = parsed.success
    ? parsed.data
    : adminQuestionListQuerySchema.parse({});
  const [questions, creators, courses] = await Promise.all([
    listAdminQuestions(query),
    listAdminQuestionCreators(),
    listQuestionImportCourses(),
  ]);
  return (
    <section className="space-y-6">
      <PageHeader
        actions={
          <Link
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            href="/admin/questions/import"
          >
            <FileUp aria-hidden="true" className="h-4 w-4" />
            批量导入题库
          </Link>
        }
        description="治理公共题目、识别历史教师来源，并确保状态变更可审计。"
        title="公共题库管理"
      />
      <QuestionGovernanceFilters
        creators={creators}
        courses={courses}
        query={query}
      />
      <div className="flex justify-between text-sm text-gray-500">
        <span>共 {questions.pagination.total} 道题目</span>
        <span>
          第 {questions.pagination.page} /{" "}
          {Math.max(questions.pagination.totalPages, 1)} 页
        </span>
      </div>
      <QuestionGovernanceList questions={questions.items} />
      {questions.pagination.totalPages > 1 ? (
        <PageIndex
          ariaLabel="公共题库分页"
          hrefForPage={(page) => pageHref(query, page)}
          page={questions.pagination.page}
          totalPages={questions.pagination.totalPages}
        />
      ) : null}
    </section>
  );
}
