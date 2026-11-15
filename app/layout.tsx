import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { TEACHER_THEME_INIT } from "@/lib/teacher-route-theme";
import { TeacherRouteTheme } from "@/components/dashboard/teacher-route-theme";
import { STUDENT_THEME_INIT } from "@/lib/student-route-theme";
import { StudentRouteTheme } from "@/components/dashboard/student-route-theme";

import "./globals.css";
// 共用尺寸与控件先加载，学生配色最后覆盖，所有规则仍限定在学生角色。
import "./teacher-theme.css";
import "./workspace-controls.css";
import "./workspace-design.css";
import "./student-theme.css";
import "./student-study.css";
import "./student-inputs.css";
import "./teacher-appearance.css";
import "./teacher-courses.css";

export const metadata: Metadata = {
  title: "智学课堂",
  description: "面向管理员、教师和学生的 AI 智能教学平台",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: STUDENT_THEME_INIT + TEACHER_THEME_INIT,
          }}
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <StudentRouteTheme />
          <TeacherRouteTheme />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
