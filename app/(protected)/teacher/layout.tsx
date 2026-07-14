import { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageRole(Role.TEACHER);
  return (
    <DashboardShell title="教师工作台" user={user}>
      {children}
    </DashboardShell>
  );
}
