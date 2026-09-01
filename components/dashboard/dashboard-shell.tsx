"use client";

import { Role } from "@prisma/client";
import {
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ChevronRight,
  ClipboardList,
  ClipboardCheck,
  GraduationCap,
  Home,
  Menu,
  Megaphone,
  School,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { buildBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { NotificationIndicator } from "@/components/notifications/notification-indicator";
import { cn } from "@/lib/utils";
import type { AuthenticatedUser } from "@/services/auth/types";

interface DashboardShellProps {
  user: AuthenticatedUser;
  title: string;
  platformName: string;
  platformAnnouncement?: string;
  children: ReactNode;
}

interface NavigationItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "管理员",
  TEACHER: "教师",
  STUDENT: "学生",
};

const NAVIGATION: Record<Role, NavigationItem[]> = {
  ADMIN: [
    { href: "/admin", label: "平台概览", icon: ShieldCheck },
    { href: "/admin/users", label: "用户管理", icon: Users },
    { href: "/admin/questions", label: "公共题库", icon: BookOpenCheck },
    { href: "/admin/classrooms", label: "班级治理", icon: School },
    { href: "/admin/course-templates", label: "课程模板", icon: BookOpenCheck },
    { href: "/admin/audit-logs", label: "审计日志", icon: ScrollText },
    { href: "/admin/announcements", label: "系统公告", icon: Megaphone },
    { href: "/admin/system-config", label: "系统配置", icon: Settings },
  ],
  TEACHER: [
    { href: "/teacher", label: "工作台", icon: Home },
    { href: "/teacher/courses", label: "课程管理", icon: BookOpenCheck },
    { href: "/teacher/classrooms", label: "班级管理", icon: School },
    { href: "/teacher/questions", label: "题库管理", icon: BookOpenCheck },
    { href: "/teacher/assignments", label: "作业管理", icon: ClipboardList },
    { href: "/teacher/results", label: "成绩统计", icon: BarChart3 },
  ],
  STUDENT: [
    { href: "/student", label: "学习主页", icon: Home },
    { href: "/student/assignments", label: "我的作业", icon: ClipboardList },
    { href: "/student/surveys", label: "课程问卷", icon: ClipboardCheck },
    { href: "/student/results", label: "我的成绩", icon: BarChart3 },
    {
      href: "/student/wrong-questions",
      label: "我的错题",
      icon: BookOpenCheck,
    },
    { href: "/student/analytics", label: "学情分析", icon: BrainCircuit },
    { href: "/student/recommendations", label: "推荐练习", icon: Sparkles },
  ],
};

const SEGMENT_LABELS: Record<string, string> = {
  admin: "平台概览",
  users: "用户管理",
  "audit-logs": "审计日志",
  "system-config": "系统配置",
  announcements: "系统公告",
  "course-templates": "课程模板",
  courses: "课程管理",
  syllabus: "教学大纲",
  "assessment-scheme": "考核方案",
  gradebook: "成绩台账",
  attendance: "出勤台账",
  "quality-report": "教学质量分析",
  profiles: "课程画像",
  "knowledge-graph": "知识图谱",
  "question-mapping": "题目知识点映射",
  "teaching-progress": "教学进度",
  "outcome-attainment": "课程目标达成度",
  students: "学生名单",
  import: "导入",
  teacher: "教师工作台",
  student: "学习主页",
  classrooms: "班级管理",
  classes: "班级管理",
  questions: "题库管理",
  assignments: "作业管理",
  surveys: "课程问卷",
  submissions: "提交记录",
  results: "成绩统计",
  result: "提交结果",
  "wrong-questions": "我的错题",
  analytics: "学情分析",
  recommendations: "推荐练习",
  notifications: "通知中心",
  practice: "练习",
  answer: "在线答题",
  new: "新建",
  edit: "编辑",
};

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/teacher" || href === "/student" || href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pageTitle(pathname: string, items: NavigationItem[]): string {
  const exactLabel =
    SEGMENT_LABELS[pathname.split("/").filter(Boolean).at(-1) ?? ""];
  if (exactLabel) return exactLabel;

  const match = [...items]
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => isCurrentPath(pathname, item.href));
  return match?.label ?? "页面详情";
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = buildBreadcrumbs(pathname, SEGMENT_LABELS);

  return (
    <nav aria-label="面包屑" className="min-w-0 overflow-hidden">
      <ol className="text-muted-foreground flex items-center gap-1 overflow-hidden text-xs">
        {crumbs.map((crumb, index) => (
          <li className="flex min-w-0 items-center gap-1" key={crumb.href}>
            {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" /> : null}
            {crumb.linkable ? (
              <Link className="truncate hover:text-gray-900" href={crumb.href}>
                {crumb.label}
              </Link>
            ) : (
              <span
                aria-current={index === crumbs.length - 1 ? "page" : undefined}
                className="truncate"
              >
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function SidebarNavigation({
  items,
  pathname,
  onNavigate,
}: {
  items: NavigationItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="主导航" className="space-y-1 px-3 py-4">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isCurrentPath(pathname, item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-gray-900 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-950",
            )}
            href={item.href}
            key={item.href}
            onClick={onNavigate}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({
  user,
  title,
  platformName,
  platformAnnouncement = "",
  children,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigationItems = NAVIGATION[user.role];
  const currentPageTitle = useMemo(
    () => pageTitle(pathname, navigationItems),
    [navigationItems, pathname],
  );

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <div className="bg-muted/40 min-h-screen">
      <aside className="bg-background fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <Link
            className="flex items-center gap-2 font-semibold"
            href="/dashboard"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
              <GraduationCap className="h-5 w-5" />
            </span>
            <span>{platformName}</span>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide">
              {title}
            </p>
          </div>
          <SidebarNavigation items={navigationItems} pathname={pathname} />
        </div>
        <div className="border-t p-4">
          <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
            {(() => {
              const displayName = user.displayName ?? user.email ?? "用户";
              return (
                <>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-sm font-semibold shadow-sm">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {displayName}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {ROLE_LABELS[user.role]}
                    </p>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="关闭菜单"
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <aside className="bg-background relative flex h-full w-[min(20rem,86vw)] flex-col shadow-xl">
            <div className="flex h-16 items-center justify-between border-b px-5">
              <Link
                className="flex items-center gap-2 font-semibold"
                href="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
                  <GraduationCap className="h-5 w-5" />
                </span>
                {platformName}
              </Link>
              <button
                aria-label="关闭菜单"
                className="rounded-md p-2 hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SidebarNavigation
                items={navigationItems}
                onNavigate={() => setMobileMenuOpen(false)}
                pathname={pathname}
              />
            </div>
            <div className="space-y-3 border-t p-4">
              <div className="flex items-center gap-3 text-sm">
                <Users className="text-muted-foreground h-4 w-4" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.displayName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {user.email} · {ROLE_LABELS[user.role]}
                  </p>
                </div>
              </div>
              <LogoutButton />
            </div>
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        <header className="bg-background/95 sticky top-0 z-20 border-b backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              aria-expanded={mobileMenuOpen}
              aria-label="打开菜单"
              className="rounded-md border p-2 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {currentPageTitle}
              </p>
              <Breadcrumbs pathname={pathname} />
            </div>
            <div className="hidden items-center gap-4 sm:flex">
              <NotificationIndicator />
              <div className="max-w-52 text-right text-sm">
                <p className="truncate font-medium">{user.displayName}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {ROLE_LABELS[user.role]} · {user.email}
                </p>
              </div>
              <LogoutButton />
            </div>
            <div className="sm:hidden">
              <NotificationIndicator />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {platformAnnouncement ? (
            <div
              className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              {platformAnnouncement}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
