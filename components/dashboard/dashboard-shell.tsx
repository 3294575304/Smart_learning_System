"use client";
import { safeStudentReturn } from "@/services/assignments/student-query";

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
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import {
  NavigationMemory,
  NavigationMemoryProvider,
} from "@/components/dashboard/navigation-memory";
import { AdminDashboardCacheProvider } from "@/components/admin/dashboard/admin-dashboard-cache";
import { SchoolIdentity } from "@/components/dashboard/school-identity";
import { LogoutButton } from "@/components/auth/logout-button";
import { JoinClassroomForm } from "@/components/classrooms/join-classroom-form";
import { buildBreadcrumbs } from "@/components/dashboard/breadcrumbs";
import { FeedbackLink } from "@/components/dashboard/feedback-link";
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
  SUPER_ADMIN: "超级管理员",
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
  const searchParams = useSearchParams();
  const classroomId = searchParams.get("classroomId");
  const returnTo = searchParams.get("returnTo");
  const studentQueryHref = safeStudentReturn(returnTo ?? undefined);
  const crumbs = buildBreadcrumbs(pathname, undefined, {
    studentId: searchParams.get("studentId"),
    view: searchParams.get("view"),
    studentQueryHref,
  }).map((crumb) =>
    classroomId &&
    crumb.href.startsWith("/student/courses/") &&
    crumb.href.endsWith("/learning-center")
      ? {
          ...crumb,
          href: `${crumb.href}?${new URLSearchParams({
            classroomId,
            ...(pathname.endsWith("/knowledge-graph")
              ? { tab: "growth", section: "knowledge" }
              : pathname.endsWith("/profile")
                ? {
                    tab: "growth",
                    section: searchParams.has("conceptId")
                      ? "knowledge"
                      : "profile",
                  }
                : {}),
          })}`,
        }
      : crumb,
  );

  const nativeBreadcrumbs = pathname.startsWith("/student");
  const breadcrumbClassName =
    "inline-flex min-w-0 items-center gap-1 truncate rounded px-1 py-0.5 font-medium text-sky-700 underline-offset-4 transition hover:bg-sky-100 hover:underline focus-visible:outline-2 focus-visible:outline-sky-600";
  if (!crumbs.length) return null;
  return (
    <nav aria-label="面包屑" className="min-w-0 overflow-hidden">
      <ol className="text-muted-foreground flex items-center gap-1 overflow-hidden text-xs">
        {crumbs.map((crumb, index) => {
          const isCurrent = index === crumbs.length - 1;
          return (
            <li
              key={crumb.href}
              // 当前页在桌面由面包屑末项承担，移动端交给顶栏标题，避免同一名称出现两次。
              className={`min-w-0 items-center gap-1 ${isCurrent ? "hidden lg:flex" : "flex"}`}
            >
              {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" /> : null}
              {crumb.linkable && !isCurrent ? (
                nativeBreadcrumbs ? (
                  <a className={breadcrumbClassName} href={crumb.href}>
                    {crumb.label}
                  </a>
                ) : (
                  <FeedbackLink
                    className={breadcrumbClassName}
                    href={crumb.href}
                    label={crumb.label}
                    arrow={false}
                    preserveLabel
                  />
                )
              ) : (
                <span
                  aria-current={isCurrent ? "page" : undefined}
                  className={
                    isCurrent
                      ? "truncate text-sm font-semibold text-slate-900"
                      : "truncate"
                  }
                >
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ContextPageTitle({
  pathname,
  groups,
}: {
  pathname: string;
  groups: NavigationGroup[];
}) {
  const query = useSearchParams();
  return (
    <p className="truncate text-sm font-semibold">
      {buildBreadcrumbs(pathname, undefined, {
        studentId: query.get("studentId"),
        view: query.get("view"),
      }).at(-1)?.label ?? getDashboardPageTitle(pathname, groups)}
    </p>
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
  const NavigationLink = student ? "a" : Link;
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
                <NavigationLink
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
                </NavigationLink>
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
  const menuDialogRef = useRef<HTMLDivElement>(null);
  const menuOpenButtonRef = useRef<HTMLButtonElement>(null);
  const navigationGroups = NAVIGATION[user.role];
  const userName = displayUserName(user);
  const schoolName = user.schoolName?.trim() || platformName;
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

  // 移动端导航抽屉：Esc 关闭、焦点移入并在抽屉内循环，关闭后归还给触发按钮。
  // 没有这一段时，Tab 会跑到遮罩之后的正文，Esc 也关不掉。
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const dialog = menuDialogRef.current;
    if (!dialog) return;
    // 遮罩上的「关闭菜单」全屏按钮位于容器内、视觉之外，焦点与 Tab 循环只限定在面板内部。
    const panel =
      dialog.querySelector<HTMLElement>("#mobile-navigation-dialog") ?? dialog;
    const previousFocus = document.activeElement as HTMLElement | null;
    const opener = menuOpenButtonRef.current;
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
    (focusables()[0] ?? panel).focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      (opener ?? previousFocus)?.focus?.();
    };
  }, [mobileMenuOpen]);

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
      {/* 键盘用户可直接跳过整组侧栏导航，不必每页 Tab 穿过全部入口。 */}
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:border focus:border-sky-200 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-sky-800 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-sky-700"
      >
        跳到正文
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sky-100 bg-white/95 lg:flex lg:flex-col">
        <div
          className={
            user.role === Role.SUPER_ADMIN
              ? "flex h-16 items-center border-b px-6"
              : "flex h-16 items-center justify-start border-b px-6"
          }
        >
          {user.role === Role.SUPER_ADMIN ? (
            <Link
              className="flex items-center gap-2 font-semibold"
              href="/dashboard"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 text-white">
                <GraduationCap className="h-5 w-5" />
              </span>
              <span>{platformName}</span>
            </Link>
          ) : (
            <div className="w-full min-w-0">
              <SchoolIdentity
                compact
                logoUrl={user.schoolLogoUrl}
                name={schoolName}
                nameImageUrl={user.schoolNameImageUrl}
              />
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {user.role !== Role.SUPER_ADMIN ? (
            <div className="px-6 pt-5 pb-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wide">
                {title}
              </p>
            </div>
          ) : null}
          <SidebarNavigation
            groups={navigationGroups}
            pathname={pathname}
            student={user.role === Role.STUDENT}
          />
        </div>
      </aside>

      {mobileMenuOpen ? (
        <div ref={menuDialogRef} className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="关闭菜单"
            className="absolute inset-0 bg-sky-950/20"
            onClick={() => setMobileMenuOpen(false)}
            type="button"
          />
          <aside
            id="mobile-navigation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="导航菜单"
            tabIndex={-1}
            className="bg-background relative flex h-full w-[min(20rem,86vw)] flex-col shadow-xl"
          >
            <div
              className={
                user.role === Role.SUPER_ADMIN
                  ? "relative flex h-16 items-center justify-between border-b px-5"
                  : "relative flex h-16 items-center justify-start border-b px-4 pr-12"
              }
            >
              {user.role === Role.SUPER_ADMIN ? (
                <Link
                  className="flex min-w-0 flex-1 items-center gap-2 font-semibold"
                  href="/dashboard"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-emerald-500 text-white">
                    <GraduationCap className="h-5 w-5" />
                  </span>
                  <span>{platformName}</span>
                </Link>
              ) : (
                <div className="min-w-0 flex-1">
                  <SchoolIdentity
                    compact
                    logoUrl={user.schoolLogoUrl}
                    name={schoolName}
                    nameImageUrl={user.schoolNameImageUrl}
                  />
                </div>
              )}
              <button
                aria-label="关闭菜单"
                className={
                  user.role === Role.SUPER_ADMIN
                    ? "rounded-md p-2 hover:bg-gray-100"
                    : "absolute top-3 right-2 rounded-md p-2 hover:bg-gray-100"
                }
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
              ref={menuOpenButtonRef}
              aria-expanded={mobileMenuOpen}
              aria-haspopup="dialog"
              aria-controls="mobile-navigation-dialog"
              aria-label="打开菜单"
              className="rounded-md border p-2 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              {/* 桌面端侧栏已高亮当前模块、面包屑末项也给出当前位置，标题只服务于移动端。 */}
              <div className="lg:hidden">
                <Suspense
                  fallback={
                    <p className="truncate text-sm font-semibold">
                      {currentPageTitle}
                    </p>
                  }
                >
                  <ContextPageTitle
                    pathname={pathname}
                    groups={navigationGroups}
                  />
                </Suspense>
              </div>
              <Suspense fallback={null}>
                <Breadcrumbs pathname={pathname} />
              </Suspense>
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
        <main
          id="dashboard-main"
          tabIndex={-1}
          data-workspace-role={user.role}
          className={cn(
            "mx-auto w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
            user.role === Role.STUDENT
              ? "max-w-7xl"
              : user.role === Role.TEACHER && pathname === "/teacher"
                ? "max-w-none lg:py-5"
                : "max-w-7xl",
          )}
        >
          {platformAnnouncement ? (
            <div
              className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="status"
            >
              {platformAnnouncement}
            </div>
          ) : null}
          <NavigationMemoryProvider userId={user.id}>
            <Suspense fallback={null}>
              <NavigationMemory userId={user.id} />
            </Suspense>
            {user.role === Role.ADMIN ? (
              <AdminDashboardCacheProvider
                scopeKey={`${user.id}:${user.schoolName ?? "unbound"}`}
              >
                {children}
              </AdminDashboardCacheProvider>
            ) : (
              children
            )}
          </NavigationMemoryProvider>
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
