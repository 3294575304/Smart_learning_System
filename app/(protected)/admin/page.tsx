import { Role } from "@prisma/client";
import { School, ScrollText, Settings, UserCog, Users } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { requirePageRole } from "@/services/auth/page-authorization";
import { getAdminDashboard } from "@/services/dashboard/admin-dashboard";

export default async function AdminPage() {
  await requirePageRole(Role.ADMIN);
  const metrics = await getAdminDashboard();

  return (
    <section className="space-y-7">
      <PageHeader
        description="查看平台当前基础数据并进入用户、审计与系统配置管理。"
        eyebrow="Admin console"
        title="平台概览"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          hint="包含管理员、教师和学生"
          icon={Users}
          label="全部用户"
          value={metrics.userCount}
        />
        <StatCard
          hint="当前平台注册教师"
          icon={UserCog}
          label="教师"
          value={metrics.teacherCount}
        />
        <StatCard
          hint="当前平台注册学生"
          icon={Users}
          label="学生"
          value={metrics.studentCount}
        />
        <StatCard
          hint="包含开放与已关闭班级"
          icon={School}
          label="班级"
          value={metrics.classroomCount}
        />
      </div>

      <section>
        <h2 className="font-semibold">管理模块</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          管理用户账号、审计重要操作并维护能够真实影响业务的系统参数。
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Link
            className="bg-card rounded-xl border p-6 transition-colors hover:border-gray-400"
            href="/admin/users"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-medium">用户与角色管理</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  查询、创建和维护用户资料、角色与状态。
                </p>
                <p className="mt-3 text-sm font-medium">进入用户管理</p>
              </div>
            </div>
          </Link>
          <Link
            className="bg-card rounded-xl border p-6 transition-colors hover:border-gray-400"
            href="/admin/audit-logs"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                <ScrollText className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-medium">管理操作审计</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  查看用户创建、资料、角色和状态变更记录。
                </p>
                <p className="mt-3 text-sm font-medium">查看审计日志</p>
              </div>
            </div>
          </Link>
          <Link
            className="bg-card rounded-xl border p-6 transition-colors hover:border-gray-400 md:col-span-2"
            href="/admin/system-config"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
                <Settings className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-medium">系统配置</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  管理平台展示、维护、注册、作业默认值和 AI 增强分析开关。
                </p>
                <p className="mt-3 text-sm font-medium">进入系统配置</p>
              </div>
            </div>
          </Link>
        </div>
      </section>
    </section>
  );
}
