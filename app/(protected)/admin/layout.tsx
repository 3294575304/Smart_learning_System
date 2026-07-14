import { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageRole(Role.ADMIN);
  return (
    <DashboardShell title="管理员工作台" user={user}>
      {children}
    </DashboardShell>
  );
}
