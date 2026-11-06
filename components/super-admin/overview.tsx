import { Role } from "@prisma/client";
import {
  Activity,
  BookOpen,
  Building2,
  ClipboardList,
  FileQuestion,
  GraduationCap,
  ShieldCheck,
  Users,
} from "lucide-react";

import { StatCard } from "@/components/dashboard/stat-card";
import { RefreshOverview } from "@/components/super-admin/refresh-overview";
import { SuperAdminSystemHealth } from "@/components/super-admin/system-health";
import type { SuperAdminOverviewData } from "@/services/super-admin/overview";

const number = (value: number) => value.toLocaleString("zh-CN");
const roleColors: Record<Role, string> = {
  SUPER_ADMIN: "bg-indigo-500",
  ADMIN: "bg-sky-500",
  TEACHER: "bg-teal-500",
  STUDENT: "bg-emerald-500",
};

export function SuperAdminOverview({ data }: { data: SuperAdminOverviewData }) {
  const admins = data.users.roles.find((item) => item.role === Role.ADMIN);
  const updatedAt = new Date(data.generatedAt).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 rounded-2xl border border-sky-100 bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-sky-700">超级管理员工作台</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
            平台运行概览
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            查看学校接入、账号规模与教学资源的当前情况。
          </p>
          <p className="text-muted-foreground mt-3 text-xs">
            更新于 {updatedAt}（北京时间）
          </p>
        </div>
        <div className="shrink-0">
          <RefreshOverview />
        </div>
      </header>

      <section
        aria-label="平台核心指标"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          icon={Building2}
          label="使用学校数量"
          value={number(data.schools.inUse)}
          hint={`已绑定高校管理员 · 共 ${number(data.schools.total)} 所学校记录`}
        />
        <StatCard
          icon={ShieldCheck}
          label="高校管理员数量"
          value={number(admins?.total ?? 0)}
          hint={`已启用 ${number(admins?.enabled ?? 0)} 人 · 不含超级管理员`}
        />
        <StatCard
          icon={Users}
          label="系统总用户数量"
          value={number(data.users.total)}
          hint={`包含全部角色 · 近 7 天新增 ${number(data.users.newLast7Days)} 人`}
        />
        <StatCard
          icon={Activity}
          label="近 7 天登录用户"
          value={number(data.users.loggedInLast7Days)}
          hint="按最近一次登录时间统计，非当前在线人数"
        />
      </section>

      <div className="grid items-stretch gap-6 xl:grid-cols-3">
        <section
          aria-labelledby="user-distribution-title"
          className="bg-card rounded-xl border border-sky-100 p-6 shadow-sm xl:col-span-2"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 id="user-distribution-title" className="font-semibold">
                账号构成
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                全平台已创建账号，包含启用和禁用状态。
              </p>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
              共 {number(data.users.total)} 人
            </span>
          </div>
          {data.users.total === 0 ? (
            <p className="text-muted-foreground mt-6 text-sm">暂无用户数据。</p>
          ) : null}
          <div className="mt-6 space-y-5">
            {data.users.roles.map((item) => {
              const percentage =
                data.users.total === 0
                  ? 0
                  : (item.total / data.users.total) * 100;
              return (
                <div key={item.role}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span>{item.label}</span>
                    <span>
                      <strong className="font-semibold">
                        {number(item.total)}
                      </strong>
                      <span className="text-muted-foreground ml-3 text-xs">
                        {percentage.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div
                    role="img"
                    aria-label={`${item.label} ${number(item.total)} 人，占 ${percentage.toFixed(1)}%`}
                    className="h-2 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div
                      className={`h-full rounded-full ${roleColors[item.role]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-sky-100 pt-5">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs text-emerald-700">已启用账号</p>
              <p className="mt-1 text-xl font-semibold text-emerald-900">
                {number(data.users.enabled)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">已禁用账号</p>
              <p className="mt-1 text-xl font-semibold text-slate-800">
                {number(data.users.disabled)}
              </p>
            </div>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            待认领的学生身份尚未创建账号，不计入用户总数。
          </p>
        </section>

        <SuperAdminSystemHealth refreshKey={data.generatedAt} />
      </div>

      <section aria-labelledby="teaching-resources-title">
        <h2 id="teaching-resources-title" className="font-semibold">
          教学资源概况
        </h2>
        <p className="text-muted-foreground mt-1 mb-4 text-xs">
          全平台累计资源，课程、班级及作业包含历史记录。
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={BookOpen}
            label="课程总数"
            value={number(data.teaching.courses)}
            hint="包含草稿、授课中及归档课程"
          />
          <StatCard
            icon={GraduationCap}
            label="班级总数"
            value={number(data.teaching.classrooms)}
            hint={`其中授课中 ${number(data.teaching.activeClassrooms)} 个`}
          />
          <StatCard
            icon={FileQuestion}
            label="题目总数"
            value={number(data.teaching.questions)}
            hint="不含已删除题目"
          />
          <StatCard
            icon={ClipboardList}
            label="作业总数"
            value={number(data.teaching.assignments)}
            hint="包含草稿、已发布、已结束及归档作业"
          />
        </div>
      </section>
    </div>
  );
}
