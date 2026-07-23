import { Role } from "@prisma/client";
import { BookOpenCheck, CircleCheckBig, CircleX } from "lucide-react";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { WrongQuestionFilters } from "@/components/wrong-questions/wrong-question-filters";
import { WrongQuestionList } from "@/components/wrong-questions/wrong-question-list";
import { WrongQuestionPagination } from "@/components/wrong-questions/wrong-question-pagination";
import { requirePageRole } from "@/services/auth/page-authorization";
import {
  wrongQuestionListQuerySchema,
  type WrongQuestionListQuery,
} from "@/services/wrong-questions/schemas";
import { listWrongQuestions } from "@/services/wrong-questions/service";

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
    query.knowledgePointId ||
    query.type ||
    query.isMastered !== undefined ||
    query.recentDays,
  );
}

export default async function StudentWrongQuestionsPage({
  searchParams,
}: Props) {
  const student = await requirePageRole(Role.STUDENT);
  const parsed = wrongQuestionListQuerySchema.safeParse(
    firstValues(await searchParams),
  );
  const query = parsed.success
    ? parsed.data
    : wrongQuestionListQuerySchema.parse({});
  const result = await listWrongQuestions(student.id, query);

  return (
    <section className="space-y-6">
      <PageHeader
        description="集中复习作业和推荐练习中的错题，查看解析并维护自己的掌握状态。"
        title="我的错题本"
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={BookOpenCheck}
          label="错题总数"
          value={result.summary.total}
        />
        <StatCard
          icon={CircleX}
          label="未掌握"
          value={result.summary.unmastered}
        />
        <StatCard
          icon={CircleCheckBig}
          label="已掌握"
          value={result.summary.mastered}
        />
      </div>
      <WrongQuestionFilters
        filterOptions={result.filterOptions}
        query={query}
      />
      <p className="text-muted-foreground text-sm">
        当前筛选共 {result.pagination.total} 道错题
      </p>
      <WrongQuestionList
        hasFilters={hasActiveFilters(query)}
        items={result.items}
      />
      <WrongQuestionPagination
        query={query}
        total={result.pagination.total}
        totalPages={result.pagination.totalPages}
      />
    </section>
  );
}
