import { SuperAdminOverview } from "@/components/super-admin/overview";
import { getSuperAdminOverview } from "@/services/super-admin/overview";

export default async function SuperAdminPage() {
  const overview = await getSuperAdminOverview();
  return <SuperAdminOverview data={overview} />;
}
