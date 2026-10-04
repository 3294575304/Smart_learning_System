import type { Role } from "@prisma/client";
import {
  BarChart3,
  BookOpenCheck,
  BrainCircuit,
  ClipboardCheck,
  ClipboardList,
  Home,
  Library,
  Megaphone,
  NotebookPen,
  School,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { ComponentType } from "react";

export interface NavigationItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  relatedPaths?: string[];
}

export interface NavigationGroup {
  label?: string;
  items: NavigationItem[];
}

export const NAVIGATION: Record<Role, NavigationGroup[]> = {
  ADMIN: [
    {
      items: [
        { href: "/admin", label: "平台概览", icon: ShieldCheck },
        { href: "/admin/users", label: "用户管理", icon: Users },
        { href: "/admin/questions", label: "公共题库", icon: BookOpenCheck },
        { href: "/admin/classrooms", label: "班级治理", icon: School },
        {
          href: "/admin/course-templates",
          label: "课程模板",
          icon: BookOpenCheck,
        },
        { href: "/admin/audit-logs", label: "审计日志", icon: ScrollText },
        { href: "/admin/announcements", label: "系统公告", icon: Megaphone },
        { href: "/admin/system-config", label: "系统配置", icon: Settings },
      ],
    },
  ],
  TEACHER: [
    {
      items: [
        { href: "/teacher", label: "工作台", icon: Home },
        { href: "/teacher/courses", label: "课程管理", icon: BookOpenCheck },
        { href: "/teacher/classrooms", label: "班级管理", icon: School },
        { href: "/teacher/questions", label: "题库管理", icon: BookOpenCheck },
        {
          href: "/teacher/assignments",
          label: "作业管理",
          icon: ClipboardList,
        },
        { href: "/teacher/results", label: "成绩统计", icon: BarChart3 },
      ],
    },
  ],
  STUDENT: [
    { items: [{ href: "/student", label: "学习主页", icon: Home }] },
    {
      label: "课程学习",
      items: [
        { href: "/student/courses", label: "我的课程", icon: Library },
        {
          href: "/student/tasks",
          label: "学习任务",
          icon: ClipboardCheck,
          relatedPaths: [
            "/student/assignments",
            "/student/attendance",
            "/student/surveys",
          ],
        },
      ],
    },
    {
      label: "练习巩固",
      items: [
        { href: "/student/recommendations", label: "练习中心", icon: Sparkles },
        {
          href: "/student/wrong-questions",
          label: "错题本",
          icon: NotebookPen,
        },
      ],
    },
    {
      label: "学习反馈",
      items: [
        {
          href: "/student/results",
          label: "我的成绩",
          icon: BarChart3,
          relatedPaths: ["/student/course-grades"],
        },
        { href: "/student/analytics", label: "学习分析", icon: BrainCircuit },
      ],
    },
  ],
};

export const SEGMENT_LABELS: Readonly<Record<string, string>> = {
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

const STUDENT_SEGMENT_LABELS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(
    NAVIGATION.STUDENT.flatMap((group) =>
      group.items.map((item) => [item.href.split("/").at(-1), item.label]),
    ),
  ),
  "course-grades": "课程正式成绩",
  assignments: "我的作业",
  attendance: "签到与出勤",
  surveys: "课程问卷",
  tasks: "学习任务",
  "learning-center": "课程学习中心",
  profile: "我的课程画像",
};

export function getSegmentLabels(
  pathname: string,
  labels: Readonly<Record<string, string>> = SEGMENT_LABELS,
): Readonly<Record<string, string>> {
  return pathname === "/student" || pathname.startsWith("/student/")
    ? { ...labels, ...STUDENT_SEGMENT_LABELS }
    : labels;
}

function isCurrentPath(pathname: string, href: string): boolean {
  if (href === "/teacher" || href === "/student" || href === "/admin") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavigationItemActive(
  pathname: string,
  item: NavigationItem,
): boolean {
  return [item.href, ...(item.relatedPaths ?? [])].some((href) =>
    isCurrentPath(pathname, href),
  );
}

export function getDashboardPageTitle(
  pathname: string,
  groups: NavigationGroup[],
): string {
  const labels = getSegmentLabels(pathname);
  const exactLabel = labels[pathname.split("/").filter(Boolean).at(-1) ?? ""];
  if (exactLabel) return exactLabel;

  const match = groups
    .flatMap((group) => group.items)
    .sort((left, right) => right.href.length - left.href.length)
    .find((item) => isNavigationItemActive(pathname, item));
  if (!match) return "页面详情";
  const relatedPath = match.relatedPaths?.find((href) =>
    isCurrentPath(pathname, href),
  );
  const relatedLabel = relatedPath
    ? labels[relatedPath.split("/").filter(Boolean).at(-1) ?? ""]
    : undefined;
  return relatedLabel ?? match.label;
}
