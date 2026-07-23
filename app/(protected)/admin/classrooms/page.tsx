import { Role } from "@prisma/client";
import Link from "next/link";

import { ClassroomGovernanceFilters } from "@/components/admin/classroom-governance-filters";
import { ClassroomGovernanceList } from "@/components/admin/classroom-governance-list";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  adminClassroomListQuerySchema,
  type AdminClassroomListQuery,
} from "@/services/admin/classrooms/schemas";
import { listAdminClassrooms } from "@/services/admin/classrooms/service";
import { requirePageRole } from "@/services/auth/page-authorization";

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

function pageHref(query: AdminClassroomListQuery, page: number): string {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(query.pageSize),
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.status) params.set("status", query.status);
  return `/admin/classrooms?${params.toString()}`;
}

export default async function AdminClassroomsPage({ searchParams }: PageProps) {
  await requirePageRole(Role.ADMIN);
  const parsed = adminClassroomListQuerySchema.safeParse(
    firstValues(await searchParams),
  );
  const query = parsed.success
    ? parsed.data
    : adminClassroomListQuerySchema.parse({});
  const classrooms = await listAdminClassrooms(query);
  return (
    <section className="space-y-6">
      <PageHeader
        description="查看平台班级运行状态，并在必要时软关闭异常班级。"
        title="班级治理"
      />
      <ClassroomGovernanceFilters query={query} />
      <div className="flex justify-between text-sm text-gray-500">
        <span>共 {classrooms.pagination.total} 个班级</span>
        <span>
          第 {classrooms.pagination.page} /{" "}
          {Math.max(classrooms.pagination.totalPages, 1)} 页
        </span>
      </div>
      <ClassroomGovernanceList classrooms={classrooms.items} />
      {classrooms.pagination.totalPages > 1 ? (
        <nav className="flex justify-center gap-3">
          {query.page > 1 ? (
            <Link
              className="rounded-md border px-3 py-2"
              href={pageHref(query, query.page - 1)}
            >
              上一页
            </Link>
          ) : null}
          {query.page < classrooms.pagination.totalPages ? (
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
