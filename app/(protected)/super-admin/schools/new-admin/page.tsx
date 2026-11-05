import { Role } from "@prisma/client";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreateSchoolAdminForm } from "@/components/super-admin/provisioning-forms";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getAvailableSchools } from "@/services/schools/service";

export default async function NewSchoolAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole(Role.SUPER_ADMIN, { loginPath: "/admin-login" });
  const [schools, params] = await Promise.all([
    getAvailableSchools(),
    searchParams,
  ]);
  const initialSchoolId =
    typeof params.schoolId === "string" &&
    schools.some((school) => school.id === params.schoolId)
      ? params.schoolId
      : "";
  return (
    <section className="space-y-6">
      <PageHeader
        title="新建高校管理员"
        description="选择已添加的合作学校，设置管理员姓名、登录邮箱和初始密码。"
        actions={
          <Link
            href="/super-admin/schools?view=ADMINS"
            className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm text-sky-700"
          >
            返回管理员列表
          </Link>
        }
      />
      <CreateSchoolAdminForm
        schools={schools}
        initialSchoolId={initialSchoolId}
      />
    </section>
  );
}
