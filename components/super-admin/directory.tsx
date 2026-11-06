import { Building2, Plus, Search, ShieldCheck, UserPlus } from "lucide-react";
import Link from "next/link";
import { PageIndex } from "@/components/dashboard/page-index";
import { RefreshOverview } from "@/components/super-admin/refresh-overview";
import { DeleteSchoolButton } from "@/components/super-admin/delete-school-button";
import { provinceName } from "@/services/schools/provinces";
import type { SchoolAdminDirectoryData } from "@/services/super-admin/directory";
import {
  directoryHref,
  type SchoolAdminDirectoryQuery,
} from "@/services/super-admin/directory-schemas";

function dateOnly(value: Date): string {
  return value
    .toLocaleDateString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    .replace(/(\d+)(年|月|日)/g, "$1 $2")
    .replace(/(年|月)(?=\d)/g, "$1 ");
}

function dateTime(value: Date | null): string {
  return value
    ? value.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      })
    : "尚未登录";
}

export function SchoolAdminDirectory({
  data,
  query,
}: {
  data: SchoolAdminDirectoryData;
  query: SchoolAdminDirectoryQuery;
}) {
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">
            学校与管理员
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            添加合作学校，创建并绑定高校管理员账号。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshOverview />
          <Link
            href="/super-admin/schools/new-school"
            className="flex items-center gap-2 rounded-lg border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50"
          >
            <Plus className="size-4" aria-hidden="true" />
            添加合作学校
          </Link>
          <Link
            href="/super-admin/schools/new-admin"
            className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            <UserPlus className="size-4" aria-hidden="true" />
            新建管理员
          </Link>
        </div>
      </header>
      <nav
        aria-label="管理对象"
        className="flex gap-2 rounded-xl border border-sky-100 bg-white p-2"
      >
        {[
          { view: "SCHOOLS" as const, label: "学校目录", icon: Building2 },
          { view: "ADMINS" as const, label: "管理员账号", icon: ShieldCheck },
        ].map(({ view, label, icon: Icon }) => (
          <Link
            key={view}
            href={directoryHref({ ...query, view })}
            aria-current={data.view === view ? "page" : undefined}
            className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${data.view === view ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-sky-50"}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <form
        action="/super-admin/schools"
        method="get"
        className="flex flex-wrap items-end gap-3"
      >
        <input type="hidden" name="view" value={query.view} />
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label
            htmlFor="directory-keyword"
            className="mb-2 block text-sm font-medium"
          >
            {data.view === "SCHOOLS" ? "学校名称" : "姓名、邮箱或学校名称"}
          </label>
          <input
            key={`${query.view}:${query.keyword}`}
            defaultValue={query.keyword}
            id="directory-keyword"
            name="keyword"
            maxLength={100}
            placeholder="输入关键词搜索"
            className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          <Search className="size-4" aria-hidden="true" />
          搜索
        </button>
        {query.keyword ? (
          <Link
            href={directoryHref({ ...query, keyword: "" })}
            className="px-2 py-2 text-sm text-sky-700 underline"
          >
            清除搜索
          </Link>
        ) : null}
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-500">
        <p>
          共 {data.total.toLocaleString("zh-CN")}{" "}
          {data.view === "SCHOOLS" ? "所学校" : "位高校管理员"}
        </p>
        <p>
          第 {data.page} / {data.totalPages} 页
        </p>
      </div>
      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-sky-200 bg-white p-10 text-center">
          <p className="font-medium">
            {query.keyword
              ? "没有找到匹配结果"
              : data.view === "SCHOOLS"
                ? "暂无学校记录"
                : "暂无高校管理员账号"}
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            {query.keyword
              ? "可修改关键词或清除搜索后重试。"
              : "现有学校和高校管理员将显示在此处。"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-sky-100 bg-white">
          {data.view === "SCHOOLS" ? (
            <table className="w-full min-w-[540px] text-left text-sm">
              <caption className="sr-only">学校目录</caption>
              <thead className="bg-sky-50 text-slate-600">
                <tr>
                  {[
                    "学校名称",
                    "所在地区",
                    "绑定管理员",
                    "接入日期（北京时间）",
                    "操作",
                  ].map((label) => (
                    <th key={label} className="px-5 py-4 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100">
                {data.items.map((school) => (
                  <tr key={school.id} className="hover:bg-sky-50/40">
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {school.name}
                    </td>
                    <td className="px-5 py-4">
                      {provinceName(school.provinceCode)}
                    </td>
                    <td className="px-5 py-4">{school.adminCount} 人</td>
                    <td className="px-5 py-4 text-slate-500">
                      {dateOnly(school.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <DeleteSchoolButton
                        schoolId={school.id}
                        schoolName={school.name}
                        boundUsers={school.boundUsers}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full min-w-[780px] text-left text-sm">
              <caption className="sr-only">
                高校管理员账号，不含超级管理员
              </caption>
              <thead className="bg-sky-50 text-slate-600">
                <tr>
                  {[
                    "管理员",
                    "绑定学校",
                    "账号状态",
                    "最近登录（北京时间）",
                  ].map((label) => (
                    <th key={label} className="px-5 py-4 font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100">
                {data.items.map((admin) => (
                  <tr key={admin.id} className="hover:bg-sky-50/40">
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {admin.profile?.displayName ?? "未设置姓名"}
                      </p>
                      <p className="text-muted-foreground mt-1">
                        {admin.email ?? "未设置邮箱"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {admin.school?.name ?? "未绑定学校"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${admin.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {admin.status === "ACTIVE" ? "已启用" : "已禁用"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {dateTime(admin.lastLoginAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      <PageIndex
        ariaLabel="学校与管理员分页"
        page={data.page}
        totalPages={data.totalPages}
        hrefForPage={(page) => directoryHref(query, page)}
      />
    </section>
  );
}
