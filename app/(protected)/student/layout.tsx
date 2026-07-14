import { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageRole(Role.STUDENT);
  return (
    <DashboardShell title="学生工作台" user={user}>
      {children}
    </DashboardShell>
  );
}
