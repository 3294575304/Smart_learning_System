import {
  BarChart3,
  BookOpenCheck,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileChartColumn,
  FileText,
  GitBranch,
  ListChecks,
  Users,
} from "lucide-react";
import Link from "next/link";

const WORKSPACE_GROUPS = [
  {
    title: "课程建设",
    items: [
      {
        title: "教学大纲",
        description: "上传大纲，解析与审核课程内容",
        path: "syllabus",
        icon: FileText,
      },
      {
        title: "知识图谱",
        description: "构建知识结构，审核与发布图谱",
        path: "knowledge-graph",
        icon: GitBranch,
      },
      {
        title: "考核方案",
        description: "配置考核项目、权重与评分标准",
        path: "assessment-scheme",
        icon: ClipboardCheck,
      },
      {
        title: "批量题目映射",
        description: "审核题目与课程知识点的关联",
        path: "question-mapping",
        icon: ListChecks,
      },
      {
        title: "教学进度",
        description: "管理已授知识点与推荐范围",
        path: "teaching-progress",
        icon: BookOpenCheck,
      },
    ],
  },
  {
    title: "教学管理",
    items: [
      {
        title: "成绩台账",
        description: "管理成绩、发布与目标达成度",
        path: "gradebook",
        icon: ClipboardList,
      },
      {
        title: "出勤台账",
        description: "课堂签到、出勤记录与纠正",
        path: "attendance",
        icon: CalendarCheck,
      },
      {
        title: "课程画像",
        description: "查看班级学情与学生学习证据",
        path: "profiles",
        icon: Users,
      },
    ],
  },
  {
    title: "评价分析",
    items: [
      {
        title: "结课问卷",
        description: "发布自评问卷，汇总教学反馈",
        path: "surveys",
        icon: BarChart3,
      },
      {
        title: "教学质量分析",
        description: "审核分析报告，下载 DOCX 与成绩工作簿",
        path: "quality-report",
        icon: FileChartColumn,
      },
    ],
  },
];

export function CourseWorkspaceNavigation({ courseId }: { courseId: string }) {
  return (
    <nav
      aria-label="课程功能"
      className="bg-card space-y-6 rounded-xl border p-5 sm:p-6"
    >
      {WORKSPACE_GROUPS.map((group) => (
        <section key={group.title}>
          <h2 className="mb-3 text-sm font-semibold">{group.title}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.items.map(({ title, description, path, icon: Icon }) => (
              <Link
                key={path}
                href={`/teacher/courses/${courseId}/${path}`}
                className="group flex min-w-0 items-center gap-3 rounded-lg border border-transparent bg-slate-50/80 p-3 transition-colors hover:border-blue-100 hover:bg-blue-50/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-500 transition-colors group-hover:border-blue-100 group-hover:text-blue-600">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-slate-900">
                    {title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {description}
                  </p>
                </div>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-slate-400 group-hover:text-blue-600"
                />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}
