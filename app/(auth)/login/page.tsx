import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";
import { SpaceAuthLayout } from "@/components/auth/space-auth-layout";
import styles from "@/components/auth/login-space.module.css";
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
    <SpaceAuthLayout
      platformName={config.platformName}
      title={`登录${config.platformName}`}
      description="欢迎回来，继续今天的学习探索。"
      entryLabel="教师 · 学生统一入口"
      announcement={config.platformAnnouncement}
      bottomEntry={
        <p className={styles.adminEntry}>
          <ShieldCheck aria-hidden="true" size={14} />
          <Link className={styles.adminLink} href="/admin-login">
            管理员入口
          </Link>
        </p>
      }
    >
      <LoginForm
        allowRegistration={
          config.allowSelfRegistration && !config.maintenanceMode
        }
        schools={schools}
      />
    </SpaceAuthLayout>
  );
}
