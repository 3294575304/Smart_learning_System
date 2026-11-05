import { Role } from "@prisma/client";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/page-header";
import { CreatePartnerSchoolForm } from "@/components/super-admin/provisioning-forms";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function NewPartnerSchoolPage() {
  await requirePageRole(Role.SUPER_ADMIN, { loginPath: "/admin-login" });
  return (
    <section className="space-y-6">
      <PageHeader
        title="添加合作学校"
        description="先登记合作学校及所在地区，再为学校创建管理员账号。"
        actions={
          <Link
            href="/super-admin/schools"
            className="rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm text-sky-700"
          >
            返回学校目录
          </Link>
        }
      />
      <CreatePartnerSchoolForm />
    </section>
  );
}
