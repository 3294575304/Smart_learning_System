import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import type { AuthenticatedUser } from "@/services/auth/types";

interface DashboardShellProps {
  user: AuthenticatedUser;
  title: string;
  children: ReactNode;
}

export function DashboardShell({ user, title, children }: DashboardShellProps) {
  return (
    <div className="bg-muted/40 min-h-screen">
      <header className="bg-background border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <Link className="text-lg font-semibold" href="/dashboard">
              智学课堂
            </Link>
            <p className="text-muted-foreground text-sm">{title}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right text-sm">
              <p className="font-medium">{user.displayName}</p>
              <p className="text-muted-foreground">{user.email}</p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
