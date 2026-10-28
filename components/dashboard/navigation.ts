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
        { href: "/admin/questions", label: "共享题库", icon: BookOpenCheck },
        {
          href: "/admin/question-course-categories",
          label: "题库课程分类",
          icon: BookOpenCheck,
        },
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
        {
          href: "/student/recommendations",
          label: "练习中心",
          icon: Sparkles,
          relatedPaths: ["/student/practice"],
        },
        {
          href: "/student/wrong-questions",
          label: "复习中心",
          relatedPaths: ["/student/question-favorites"],
          icon: NotebookPen,
        },
      ],
    },
    {
      label: "学习反馈",
      items: [
        {
          href: "/student/course-grades",
          label: "课程总评",
          icon: BarChart3,
          relatedPaths: ["/student/results"],
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
  "question-course-categories": "题库课程分类",
  "random-picker": "随机选人",
  ai: "AI出题",
  profile: "学生画像",
  "change-initial-password": "修改初始密码",
  courses: "课程管理",
  syllabus: "教学大纲",
  "assessment-scheme": "考核方案",
  gradebook: "成绩台账",
  attendance: "出勤台账",
  "check-in": "课堂签到",
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
  "course-grades": "课程总评",
  "question-favorites": "我的收藏",
  submissions: "我的作答",
  practice: "练习",
  assignments: "我的作业",
  results: "课程总评",
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
  if (pathname === "/admin" || pathname.startsWith("/admin/"))
    return { ...labels, classrooms: "班级治理", questions: "共享题库" };
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
  if (pathname.startsWith("/student/submissions/")) {
    return item.href === "/student/tasks";
  }
  return [item.href, ...(item.relatedPaths ?? [])].some((href) =>
    isCurrentPath(pathname, href),
  );
}

/** Student page titles and breadcrumb leaves share the same resource names. */
export function getStudentPageLabel(pathname: string): string | undefined {
  const path = pathname.replace(/\/$/, "");
  if (path !== "/student" && !path.startsWith("/student/")) return undefined;
  const detailRoutes: Array<[RegExp, string]> = [
    [/^\/student\/assignments\/[^/]+$/, "作业详情"],
    [/^\/student\/surveys\/[^/]+$/, "问卷详情"],
    [/^\/student\/wrong-questions\/[^/]+$/, "错题详情"],
    [/^\/student\/question-favorites\/[^/]+$/, "收藏题目详情"],
    [/^\/student\/practice\/[^/]+$/, "练习记录"],
    [/^\/student\/recommendations\/[^/]+$/, "练习详情"],
    [/^\/student\/recommendations\/[^/]+\/practice$/, "练习作答"],
    [/^\/student\/submissions\/[^/]+\/answer$/, "在线答题"],
    [/^\/student\/submissions\/[^/]+\/result$/, "提交结果"],
  ];
  return (
    detailRoutes.find(([pattern]) => pattern.test(path))?.[1] ??
    getSegmentLabels(path)[path.split("/").at(-1) ?? ""]
  );
}

export function getDashboardPageTitle(
  pathname: string,
  groups: NavigationGroup[],
  context?: { studentId?: string | null; view?: string | null },
): string {
  const studentLabel = getStudentPageLabel(pathname);
  if (studentLabel) return studentLabel;
  if (/^\/teacher\/assignments\/students\/[^/]+$/.test(pathname))
    return "学生作业明细";
  if (
    /^\/teacher\/assignments\/[^/]+\/results$/.test(pathname) &&
    context?.studentId
  )
    return "个人作答";
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
