import { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageRole(Role.TEACHER);
  const config = await getPublicSystemConfig();
  return (
    <DashboardShell
      platformAnnouncement={config.platformAnnouncement}
      platformName={config.platformName}
      title="教师工作台"
      user={user}
    >
      {children}
    </DashboardShell>
  );
}
