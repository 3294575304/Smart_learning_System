import { ChangeInitialPasswordForm } from "@/components/auth/change-initial-password-form";
import { requireAuthenticatedPageUser } from "@/services/auth/page-authorization";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function ChangeInitialPasswordPage() {
  await requireAuthenticatedPageUser({ allowInitialPasswordChange: true });
  const config = await getPublicSystemConfig();

  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center px-6 py-12">
      <section className="bg-card w-full max-w-md rounded-xl border p-8 shadow-sm">
        <p className="text-muted-foreground text-sm font-medium">
          {config.platformName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold">修改初始密码</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          首次登录必须设置新密码，完成后即可进入学习页面。
        </p>
        <ChangeInitialPasswordForm />
      </section>
    </main>
  );
}
