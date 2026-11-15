import { z } from "zod";
import type { StudentTaskOverview } from "@/services/dashboard/student-task-overview";

export const studyAssistantInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("today") }).strict(),
  z
    .object({
      action: z.literal("find"),
      text: z.string().trim().min(1).max(120),
    })
    .strict(),
]);

const destinations = [
  { label: "我的课程", href: "/student/courses", aliases: /课程|教学班|班级/u },
  { label: "学习任务", href: "/student/tasks", aliases: /待办|学习任务/u },
  { label: "我的作业", href: "/student/assignments", aliases: /作业/u },
  { label: "课堂签到", href: "/student/attendance", aliases: /签到|出勤/u },
  { label: "课程问卷", href: "/student/surveys", aliases: /问卷/u },
  { label: "我的考试", href: "/student/exams", aliases: /考试|交卷/u },
  {
    label: "课程总评",
    href: "/student/course-grades",
    aliases: /成绩|总评|得分|分数/u,
  },
  { label: "自主练习", href: "/student/recommendations", aliases: /练习/u },
  {
    label: "我的题库",
    href: "/student/wrong-questions",
    aliases: /题库|错题|收藏/u,
  },
  {
    label: "学习分析",
    href: "/student/analytics",
    aliases: /学习分析|学情|画像/u,
  },
];

const preferredDestinations = ["我的课程", "学习任务", "我的作业", "课程总评"];
const shanghaiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function findStudyDestination(text: string) {
  const exact = destinations.find(({ label }) => label === text.trim());
  const matches = exact
    ? [exact]
    : destinations.filter(
        ({ label, aliases }) => text.includes(label) || aliases.test(text),
      );
  return {
    kind: "navigation" as const,
    message: matches.length === 1 ? "可前往以下页面。" : "你想打开哪个页面？",
    links: (matches.length
      ? matches
      : destinations.filter(({ label }) =>
          preferredDestinations.includes(label),
        )
    ).map(({ label, href }) => ({ label, href })),
  };
}

export function todayStudyTasks(
  overview: Pick<StudentTaskOverview, "pendingItems">,
  now: Date,
) {
  const date = shanghaiDate.format(now);
  const tasks = overview.pendingItems.filter(
    ({ dueAt }) => shanghaiDate.format(dueAt) === date,
  );
  return {
    kind: "today" as const,
    total: tasks.length,
    items: tasks
      .slice(0, 5)
      .map(
        ({
          id,
          title,
          action,
          href,
          classroomName,
          courseName,
          dueAt,
          kind,
        }) => ({
          id,
          title,
          action,
          href,
          classroomName,
          courseName,
          dueAt: dueAt.toISOString(),
          kind,
        }),
      ),
  };
}

export type StudyAssistantReply =
  ReturnType<typeof findStudyDestination> | ReturnType<typeof todayStudyTasks>;
