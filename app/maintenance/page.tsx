import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function MaintenancePage() {
  const [user, config] = await Promise.all([
    getCurrentUser(),
    getPublicSystemConfig(),
  ]);
  if (!config.maintenanceMode) {
    redirect(user ? roleHomePath(user.role) : "/login");
  }
  if (user?.role === "ADMIN") redirect("/admin/system-config");

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-6 py-12">
      <section className="bg-card w-full max-w-lg rounded-xl border p-8 text-center shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">
          {config.platformName}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">系统维护中</h1>
        <p className="text-muted-foreground mt-4 leading-7">
          {config.maintenanceMessage}
        </p>
        <div className="mt-8 flex justify-center">
          {user ? (
            <LogoutButton />
          ) : (
            <Link className="rounded-md border px-4 py-2 text-sm" href="/login">
              管理员登录
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
