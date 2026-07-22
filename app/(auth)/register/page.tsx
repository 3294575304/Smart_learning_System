import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(roleHomePath(user.role));
  }
  const config = await getPublicSystemConfig();
  if (config.maintenanceMode) redirect("/maintenance");

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-6 py-12">
      <section className="bg-card w-full max-w-md rounded-xl border p-8 shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">
          AI Smart Learning Platform
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {config.platformName}学生注册
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          注册后将直接进入学生工作台。
        </p>
        {config.allowSelfRegistration ? (
          <RegisterForm />
        ) : (
          <div className="mt-8 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            系统当前未开放自主注册，请联系管理员创建账号。
          </div>
        )}
      </section>
    </main>
  );
}
