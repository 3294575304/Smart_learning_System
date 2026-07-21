import { Role } from "@prisma/client";
import { School, Settings, ShieldCheck, UserCog, Users } from "lucide-react";

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
        description="查看平台当前基础数据。管理功能将在对应服务端能力完成后开放。"
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
          以下模块尚无对应的管理员服务端接口，当前不提供写操作。
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {[
            {
              title: "用户与角色管理",
              description: "管理用户状态、教师与学生信息。",
              icon: ShieldCheck,
            },
            {
              title: "系统配置",
              description: "管理平台级参数与 AI 服务配置。",
              icon: Settings,
            },
          ].map((module) => {
            const Icon = module.icon;
            return (
              <article
                className="bg-card rounded-xl border border-dashed p-6"
                key={module.title}
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-medium">{module.title}</h3>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {module.description}
                    </p>
                    <p className="mt-3 text-sm font-medium">该模块暂未开放</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
