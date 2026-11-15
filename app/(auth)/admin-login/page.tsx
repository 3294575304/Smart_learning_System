import { redirect } from "next/navigation";

import { SpaceAuthLayout } from "@/components/auth/space-auth-layout";
import { getPublicSystemConfig } from "@/services/system-config/service";

import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";

export default async function AdminLoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(
      user.mustChangePassword
        ? "/change-initial-password"
        : roleHomePath(user.role),
    );
  }

  const config = await getPublicSystemConfig();

  return (
    <SpaceAuthLayout
      platformName={config.platformName}
      title="管理员登录"
      description="管理员与超级管理员统一从此入口登录。"
      entryLabel="管理员 · 超级管理员入口"
      announcement={config.platformAnnouncement}
    >
      <AdminLoginForm />
    </SpaceAuthLayout>
  );
}
