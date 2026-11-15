import { Role } from "@prisma/client";
import type { ReactNode } from "react";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getPublicSystemConfig } from "@/services/system-config/service";
import { getStudentSidebarMetaShared } from "@/services/dashboard/student-sidebar";
import {
  getStudentTaskOverviewShared,
  sharedNowMs,
} from "@/services/dashboard/student-task-service";

export default async function StudentLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requirePageRole(Role.STUDENT);
  // 侧栏底部要显示"我在哪门课、第几周"，徽标要显示"还欠几件作业与考试"。
  // 两者都在外壳里，所以在这里取；统计与首页共用同一次查询（shared 版本）。
  const nowMs = sharedNowMs();
  const [config, sidebarMeta, overview] = await Promise.all([
    getPublicSystemConfig(),
    getStudentSidebarMetaShared(user.id, nowMs),
    getStudentTaskOverviewShared(user.id, nowMs),
  ]);
  return (
    <DashboardShell
      navBadges={{
        "/student/tasks": overview.counts.assignment + overview.counts.exam,
      }}
      platformAnnouncement={config.platformAnnouncement}
      platformName={config.platformName}
      sidebarMeta={sidebarMeta}
      title="学生工作台"
      user={user}
    >
      {children}
    </DashboardShell>
  );
}
