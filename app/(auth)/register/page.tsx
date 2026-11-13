import { redirect } from "next/navigation";
import Link from "next/link";

import { RegisterForm } from "@/components/auth/register-form";
import { SpaceAuthLayout } from "@/components/auth/space-auth-layout";
import styles from "@/components/auth/login-space.module.css";
import { roleHomePath } from "@/services/auth/authorization";
import { getCurrentUser } from "@/services/auth/session";
import { getPublicSystemConfig } from "@/services/system-config/service";
import { getAvailableSchools } from "@/services/schools/service";

export default async function RegisterPage() {
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
  if (config.maintenanceMode) redirect("/maintenance");

  return (
    <SpaceAuthLayout
      platformName={config.platformName}
      title="创建学生账号"
      description="选择学校，使用名单中的学号与姓名认领账号，开启你的学习旅程。"
      entryLabel="学生账号注册"
      announcement={config.platformAnnouncement}
      welcomeLabel="START YOUR JOURNEY"
      wide
    >
      {config.allowSelfRegistration ? (
        <RegisterForm schools={schools} />
      ) : (
        <>
          <div className={styles.announcement} role="status">
            系统当前未开放自主注册，请联系管理员创建账号。
          </div>
          <p className={styles.adminEntry}>
            <Link className={styles.adminLink} href="/login">
              返回登录
            </Link>
          </p>
        </>
      )}
    </SpaceAuthLayout>
  );
}
