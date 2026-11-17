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
    // 外层再挂一次 data-shell-role：ToastHost 与教师助手浮层渲染在
    // DashboardShell 之外，需要同一作用域才能继承教师皮肤令牌。
    <div data-shell-role={Role.TEACHER} data-workspace-theme="staff">
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
    </div>
  );
}
