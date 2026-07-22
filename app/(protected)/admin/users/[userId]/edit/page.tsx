import { Role } from "@prisma/client";
import { notFound } from "next/navigation";

import { EditUserForm } from "@/components/admin/edit-user-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { adminUserIdSchema } from "@/services/admin/users/schemas";
import { getAdminUser } from "@/services/admin/users/service";
import { requirePageRole } from "@/services/auth/page-authorization";
import { ResourceNotFoundError } from "@/services/auth/policy";

export default async function EditAdminUserPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const admin = await requirePageRole(Role.ADMIN);
  const parsedId = adminUserIdSchema.safeParse((await params).userId);
  if (!parsedId.success) notFound();
  let user;
  try {
    user = await getAdminUser(parsedId.data);
  } catch (error: unknown) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  return (
    <section className="space-y-6">
      <PageHeader
        description={`维护 ${user.displayName} 的基础资料、角色和账号状态。`}
        title="编辑用户"
      />
      <EditUserForm currentAdminId={admin.id} user={user} />
    </section>
  );
}
