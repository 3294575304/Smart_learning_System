import { SuperAdminDevelopmentLogs } from "@/components/super-admin/development-logs";
import { getSystemDevelopmentLogs } from "@/services/super-admin/development-logs";

export const dynamic = "force-dynamic";

export default async function SuperAdminDevelopmentLogsPage() {
  const logs = await getSystemDevelopmentLogs();
  return <SuperAdminDevelopmentLogs logs={logs} />;
}
