import { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { StudyAssistantLauncher } from "@/components/student-assistant/study-assistant-launcher";
import { isStudyAssistantPilotStudent } from "@/services/student-assistant/pilot";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageRole(Role.STUDENT);
  const config = await getPublicSystemConfig();
  return (
    <DashboardShell
      headerAction={
        isStudyAssistantPilotStudent(user.id) ? (
          <StudyAssistantLauncher />
        ) : undefined
      }
      platformAnnouncement={config.platformAnnouncement}
      platformName={config.platformName}
      title="学生工作台"
      user={user}
    >
      {children}
    </DashboardShell>
  );
}
