import { Role } from "@prisma/client";
import { PageContainer } from "@/components/ui/workspace";
import { PageHeader } from "@/components/dashboard/page-header";
import { requirePageRole } from "@/services/auth/page-authorization";
import { StandaloneQualityReportWorkspace } from "@/components/quality-reports/standalone-workspace";

export default async function StandaloneQualityReportPage() {
  await requirePageRole(Role.TEACHER);
  return (
    <PageContainer density="compact">
      <PageHeader
        title="上传数据生成教学质量报告"
        description="上传模板、成绩和问卷汇总，核对字段后生成待审核稿。"
      />
      <StandaloneQualityReportWorkspace />
    </PageContainer>
  );
}
