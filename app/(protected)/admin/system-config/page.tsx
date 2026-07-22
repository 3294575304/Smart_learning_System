import { Role } from "@prisma/client";

import { SystemConfigEditor } from "@/components/admin/system-config/system-config-editor";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getAdminSystemConfig } from "@/services/system-config/service";

export default async function SystemConfigPage() {
  await requirePageRole(Role.ADMIN);
  const config = await getAdminSystemConfig();
  return (
    <section className="space-y-6">
      <PageHeader
        description="管理会真实影响注册、维护状态、作业默认行为和 AI 学情分析的受控参数。密钥仍由环境变量管理。"
        title="系统配置"
      />
      <SystemConfigEditor initialView={config} />
    </section>
  );
}
