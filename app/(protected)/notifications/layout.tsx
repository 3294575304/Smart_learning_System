import type { ReactNode } from "react";
import { Role } from "@prisma/client";
import { TeacherAssistantSurface } from "@/components/courses/teacher-assistant-surface";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireAuthenticatedPageUser } from "@/services/auth/page-authorization";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const [user, config] = await Promise.all([
    requireAuthenticatedPageUser(),
    getPublicSystemConfig(),
  ]);
  return (
    <DashboardShell
      platformAnnouncement={config.platformAnnouncement}
      platformName={config.platformName}
      title="消息中心"
      user={user}
    >
      {children}
      {user.role === Role.TEACHER ? (
        <TeacherAssistantSurface teacherId={user.id} />
      ) : null}
    </DashboardShell>
  );
}
