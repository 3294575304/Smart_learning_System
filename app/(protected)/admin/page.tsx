import { Role } from "@prisma/client";

import { AdminDashboard } from "@/components/admin/dashboard/admin-dashboard";
import { requirePageRole } from "@/services/auth/page-authorization";

export default async function AdminPage() {
  await requirePageRole(Role.ADMIN);
  return <AdminDashboard />;
}
