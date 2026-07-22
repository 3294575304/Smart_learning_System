import { Role } from "@prisma/client";

import { CreateUserForm } from "@/components/admin/create-user-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function NewAdminUserPage() {
  await requirePageRole(Role.ADMIN);
  return (
    <section className="space-y-6">
      <PageHeader
        description="创建可立即登录的真实账号，不发送虚假邀请或邮件。"
        title="创建用户"
      />
      <CreateUserForm />
    </section>
  );
}
