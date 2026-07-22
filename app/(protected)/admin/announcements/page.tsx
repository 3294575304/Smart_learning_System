import { Role } from "@prisma/client";

import { AnnouncementManager } from "@/components/admin/announcements/announcement-manager";
import { PageHeader } from "@/components/dashboard/page-header";
import { announcementListQuerySchema } from "@/services/announcements/schemas";
import { listAnnouncements } from "@/services/announcements/service";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function AdminAnnouncementsPage() {
  await requirePageRole(Role.ADMIN);
  const result = await listAnnouncements(
    announcementListQuerySchema.parse({ pageSize: 20 }),
  );
  return (
    <section className="space-y-6">
      <PageHeader
        description="创建面向全部用户或指定角色的纯文本站内公告，并保留发布记录与审计日志。"
        title="系统公告"
      />
      <AnnouncementManager initialResult={result} />
    </section>
  );
}
