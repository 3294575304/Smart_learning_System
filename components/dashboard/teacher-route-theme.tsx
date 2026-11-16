"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { isTeacherRoute } from "@/lib/teacher-route-theme";

export function TeacherRouteTheme() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const notification =
      (pathname === "/notifications" ||
        pathname.startsWith("/notifications/")) &&
      document.documentElement.hasAttribute("data-teacher-route");
    document.documentElement.toggleAttribute(
      "data-teacher-route",
      isTeacherRoute(pathname) || notification,
    );
  }, [pathname]);
  return null;
}
