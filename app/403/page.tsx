import Link from "next/link";

import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";

export default async function ForbiddenPage() {
  const user = await getCurrentUser();
  const target = user
    ? user.mustChangePassword
      ? "/change-initial-password"
      : roleHomePath(user.role)
    : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="text-center">
        <p className="text-muted-foreground text-sm font-medium">403</p>
        <h1 className="mt-2 text-2xl font-semibold">没有访问权限</h1>
        <p className="text-muted-foreground mt-2">当前账号不能访问该页面。</p>
        <Link
          className="bg-primary text-primary-foreground mt-6 inline-block rounded-md px-4 py-2 text-sm font-medium"
          href={target}
        >
          {user ? "返回工作台" : "前往登录"}
        </Link>
      </section>
    </main>
  );
}
