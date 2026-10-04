"use client";

import { Role } from "@prisma/client";
import {
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Menu,
  Users,
  UserPlus,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { JoinClassroomForm } from "@/components/classrooms/join-classroom-form";
import { buildBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import {
  getDashboardPageTitle,
  isNavigationItemActive,
  NAVIGATION,
  type NavigationGroup,
} from "@/components/dashboard/navigation";
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

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "管理员",
  TEACHER: "教师",
  STUDENT: "学生",
};

function displayUserName(user: AuthenticatedUser): string {
  const displayName = user.displayName?.trim();
  if (displayName?.toLowerCase() === "user") return "用户";
  return displayName || user.email || "用户";
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = buildBreadcrumbs(pathname);

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
  groups,
  pathname,
  student = false,
  onNavigate,
}: {
  groups: NavigationGroup[];
  pathname: string;
  student?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="主导航" className="space-y-5 px-3 py-4">
      {groups.map((group) => (
        <div
          key={group.label ?? "overview"}
          role={group.label ? "group" : undefined}
          aria-label={group.label}
        >
          {group.label ? (
            <p className="mb-2 px-3 text-xs font-medium tracking-wide text-slate-500">
              {group.label}
            </p>
          ) : null}
          <div className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavigationItemActive(pathname, item);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:outline-none",
                    active
                      ? student
                        ? "bg-sky-50 text-sky-800"
                        : "bg-gradient-to-r from-sky-500 to-emerald-500 text-white shadow-sm"
                      : "text-gray-600 hover:bg-sky-50 hover:text-sky-800",
                  )}
                  href={item.href}
                  key={item.href}
                  onClick={onNavigate}
                >
                  {student && active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2.5 left-0 w-0.5 rounded-full bg-sky-600"
                    />
                  ) : null}
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [joinClassroomDialogOpen, setJoinClassroomDialogOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const navigationGroups = NAVIGATION[user.role];
  const userName = displayUserName(user);
  const currentPageTitle = useMemo(
    () => getDashboardPageTitle(pathname, navigationGroups),
    [navigationGroups, pathname],
  );

  useEffect(() => {
    setMobileMenuOpen(false);
    setAccountMenuOpen(false);
    setJoinClassroomDialogOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow =
      mobileMenuOpen || joinClassroomDialogOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [joinClassroomDialogOpen, mobileMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!joinClassroomDialogOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setJoinClassroomDialogOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [joinClassroomDialogOpen]);

  return (
    <div className="via-background min-h-screen bg-gradient-to-br from-sky-50/80 to-emerald-50/60">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sky-100 bg-white/95 lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b px-6">
          <Link
            className="flex items-center gap-2 font-semibold"
            href="/dashboard"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 text-white">
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
          <SidebarNavigation
            groups={navigationGroups}
            pathname={pathname}
            student={user.role === Role.STUDENT}
          />
        </div>
      </aside>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="关闭菜单"
            className="absolute inset-0 bg-sky-950/20"
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
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 text-white">
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
                groups={navigationGroups}
                student={user.role === Role.STUDENT}
                onNavigate={() => setMobileMenuOpen(false)}
                pathname={pathname}
              />
            </div>
            <div className="space-y-3 border-t p-4">
              <div className="flex items-center gap-3 text-sm">
                <Users className="text-muted-foreground h-4 w-4" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{userName}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {user.email} · {ROLE_LABELS[user.role]}
                  </p>
                </div>
              </div>
              {user.role === Role.STUDENT ? (
                <button
                  className="flex w-full items-center gap-2 rounded-lg border border-sky-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-sky-50"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setJoinClassroomDialogOpen(true);
                  }}
                  type="button"
                >
                  <UserPlus className="h-4 w-4 text-sky-600" />
                  加入班级
                </button>
              ) : null}
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
            <div className="ml-auto flex items-center gap-2">
              <NotificationIndicator />
              <div className="relative hidden sm:block" ref={accountMenuRef}>
                <button
                  aria-expanded={accountMenuOpen}
                  aria-haspopup="dialog"
                  aria-label={`${userName}个人中心`}
                  className="flex items-center gap-2 rounded-xl border border-sky-100 bg-white/90 px-2.5 py-1.5 text-left shadow-sm transition hover:border-sky-200 hover:bg-sky-50"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  type="button"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 text-sm font-semibold text-white">
                    {userName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="max-w-28 truncate text-sm font-medium">
                    {userName}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-gray-500 transition-transform",
                      accountMenuOpen && "rotate-180",
                    )}
                  />
                </button>
                {accountMenuOpen ? (
                  <div
                    aria-label="账号菜单"
                    className="absolute top-[calc(100%+0.5rem)] right-0 z-50 w-64 rounded-xl border border-sky-100 bg-white p-3 shadow-xl"
                    role="dialog"
                  >
                    <div className="flex items-center gap-3 border-b border-sky-100 px-1 pb-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-500 font-semibold text-white">
                        {userName.slice(0, 1).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {userName}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {user.email}
                        </p>
                        <p className="mt-0.5 text-xs text-sky-700">
                          {ROLE_LABELS[user.role]}
                        </p>
                      </div>
                    </div>
                    {user.role === Role.STUDENT ? (
                      <button
                        className="my-2 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-sky-50 hover:text-sky-800"
                        onClick={() => {
                          setAccountMenuOpen(false);
                          setJoinClassroomDialogOpen(true);
                        }}
                        type="button"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                          <UserPlus className="h-4 w-4" />
                        </span>
                        加入班级
                      </button>
                    ) : null}
                    <div className="pt-3">
                      <LogoutButton />
                    </div>
                  </div>
                ) : null}
              </div>
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

      {user.role === Role.STUDENT && joinClassroomDialogOpen ? (
        <div
          aria-label="加入班级窗口"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          role="dialog"
        >
          <button
            aria-label="关闭加入班级窗口"
            className="absolute inset-0 bg-sky-950/25 backdrop-blur-[1px]"
            onClick={() => setJoinClassroomDialogOpen(false)}
            type="button"
          />
          <section className="relative w-full max-w-md rounded-2xl border border-sky-100 bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  加入班级
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  输入教师提供的班级邀请码，加入后即可查看对应课程和作业。
                </p>
              </div>
              <button
                aria-label="关闭"
                className="shrink-0 rounded-lg p-2 text-slate-500 transition hover:bg-sky-50 hover:text-slate-900"
                onClick={() => setJoinClassroomDialogOpen(false)}
                type="button"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5">
              <JoinClassroomForm
                compact
                inputId="join-classroom-dialog-code"
                onSuccess={() => setJoinClassroomDialogOpen(false)}
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
