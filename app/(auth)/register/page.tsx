import { redirect } from "next/navigation";

import { RegisterForm } from "@/components/auth/register-form";
import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";

export default async function RegisterPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(roleHomePath(user.role));
  }

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-6 py-12">
      <section className="bg-card w-full max-w-md rounded-xl border p-8 shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">
          AI Smart Learning Platform
        </p>
        <h1 className="mt-2 text-3xl font-semibold">注册学生账号</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          注册后将直接进入学生工作台。
        </p>
        <RegisterForm />
      </section>
    </main>
  );
}
