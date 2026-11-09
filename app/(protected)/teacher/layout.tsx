import { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ToastHost } from "@/components/ui/toast";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getPublicSystemConfig } from "@/services/system-config/service";
import { TeacherAssistantSurface } from "@/components/courses/teacher-assistant-surface";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageRole(Role.TEACHER);
  const config = await getPublicSystemConfig();
  return (
    <>
      <DashboardShell
        platformAnnouncement={config.platformAnnouncement}
        platformName={config.platformName}
        title="教师工作台"
        user={user}
      >
        {children}
      </DashboardShell>
      <ToastHost />
      <TeacherAssistantSurface teacherId={user.id} />
    </>
  );
}
