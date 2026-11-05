import { redirect } from "next/navigation";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";
import { getPublicSystemConfig } from "@/services/system-config/service";
import { getAvailableSchools } from "@/services/schools/service";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(
      user.mustChangePassword
        ? "/change-initial-password"
        : roleHomePath(user.role),
    );
  }
  const [config, schools] = await Promise.all([
    getPublicSystemConfig(),
    getAvailableSchools(),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60 px-6 py-12">
      <section className="bg-card w-full max-w-md rounded-2xl border border-sky-100 p-8 shadow-xl shadow-sky-100/70">
        <p className="text-sm font-medium text-sky-700">
          AI Smart Learning Platform
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          登录{config.platformName}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          使用教师或学生账号继续。
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
          schools={schools}
        />
        <p className="mt-6 border-t border-sky-100 pt-4 text-center text-sm">
          <Link
            className="font-medium text-sky-700 underline"
            href="/admin-login"
          >
            管理员入口
          </Link>
        </p>
      </section>
    </main>
  );
}
