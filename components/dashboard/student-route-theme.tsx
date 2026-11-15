"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { isStudentRoute } from "@/lib/student-route-theme";

/** 完整请求由 head 脚本先设置主题；站内跳转在绘制前同步，离开学生端时清理。 */
export function StudentRouteTheme() {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const student = isStudentRoute(pathname);
    const studentNotification =
      pathname.startsWith("/notifications") &&
      document.documentElement.hasAttribute("data-student-route");
    document.documentElement.toggleAttribute(
      "data-student-route",
      student || studentNotification,
    );
  }, [pathname]);
  return null;
}
