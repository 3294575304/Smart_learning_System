import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(roleHomePath(user.role));
  }
  const config = await getPublicSystemConfig();

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-6 py-12">
      <section className="bg-card w-full max-w-md rounded-xl border p-8 shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">
          AI Smart Learning Platform
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          登录{config.platformName}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          使用管理员、教师或学生账号继续。
        </p>
        {config.platformAnnouncement ? (
          <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            {config.platformAnnouncement}
          </p>
        ) : null}
        <LoginForm
          allowRegistration={
            config.allowSelfRegistration && !config.maintenanceMode
          }
        />
      </section>
    </main>
  );
}
