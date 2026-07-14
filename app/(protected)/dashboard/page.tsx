import { redirect } from "next/navigation";

import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";

export default async function DashboardRedirectPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  redirect(roleHomePath(user.role));
}
