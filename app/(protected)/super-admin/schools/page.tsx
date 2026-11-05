import { Role } from "@prisma/client";
import Link from "next/link";
import { SchoolAdminDirectory } from "@/components/super-admin/directory";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getSchoolAdminDirectory } from "@/services/super-admin/directory";
import { schoolAdminDirectorySchema } from "@/services/super-admin/directory-schemas";

export default async function SchoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole(Role.SUPER_ADMIN, { loginPath: "/admin-login" });
  const params = await searchParams;
  const parsed = schoolAdminDirectorySchema.safeParse({
    view: params.view,
    keyword: params.keyword,
    page: params.page,
  });
  if (!parsed.success)
    return (
      <section className="bg-card rounded-xl border p-6" role="alert">
        <h1 className="text-xl font-semibold">搜索条件无效</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {parsed.error.issues[0]?.message}
        </p>
        <Link
          href="/super-admin/schools"
          className="mt-4 inline-block text-sky-700 underline"
        >
          重置搜索条件
        </Link>
      </section>
    );
  const data = await getSchoolAdminDirectory(parsed.data);
  return (
    <SchoolAdminDirectory
      data={data}
      query={{ ...parsed.data, page: data.page }}
    />
  );
}
