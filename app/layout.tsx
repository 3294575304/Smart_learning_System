import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
// 师生主题按角色隔离；共用控件最后加载，统一菜单和主行动状态。
import "./teacher-theme.css";
import "./student-theme.css";
import "./workspace-controls.css";
import "./workspace-design.css";

export const metadata: Metadata = {
  title: "智学课堂",
  description: "面向管理员、教师和学生的 AI 智能教学平台",
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
