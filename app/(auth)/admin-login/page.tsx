import { redirect } from "next/navigation";

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

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-100/70 via-white to-emerald-100/60 px-6 py-12">
      <section className="bg-card w-full max-w-md rounded-2xl border border-sky-100 p-8 shadow-xl shadow-sky-100/70">
        <p className="text-sm font-medium text-sky-700">Administrator Access</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-900">
          管理员登录
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          管理员与超级管理员统一从此入口登录。
        </p>
        <AdminLoginForm />
      </section>
    </main>
  );
}
