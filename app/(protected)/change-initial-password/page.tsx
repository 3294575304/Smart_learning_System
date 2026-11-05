import { ChangeInitialPasswordForm } from "@/components/auth/change-initial-password-form";
import { SchoolIdentity } from "@/components/dashboard/school-identity";
import { requireAuthenticatedPageUser } from "@/services/auth/page-authorization";
import { getPublicSystemConfig } from "@/services/system-config/service";

export default async function ChangeInitialPasswordPage() {
  const user = await requireAuthenticatedPageUser({
    allowInitialPasswordChange: true,
  });
  const config = await getPublicSystemConfig();

  return (
    <main className="bg-muted/40 flex min-h-screen flex-col px-6 py-12">
      <header className="flex h-16 shrink-0 items-center">
        <SchoolIdentity
          logoUrl={user.schoolLogoUrl}
          name={user.schoolName ?? "未绑定学校"}
          nameImageUrl={user.schoolNameImageUrl}
        />
      </header>
      <div className="flex flex-1 items-center justify-center">
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
      </div>
    </main>
  );
}
