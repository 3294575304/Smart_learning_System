import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * 学习中心首屏的三组"读数"，都是能从库里算出来的事实：
 *
 * 1. 本周学习时长：作业从开始作答到交卷的跨度（单份封顶 120 分钟，
 *    避免挂机把数字撑大），加上练习作答时前端回传的答题耗时。
 *    没有计时表，这是唯一不靠编的近似口径，页面文案也只说"学习时长"。
 * 2. 连续学习天数：近 90 天里发生过交卷、练习作答或学习事件的自然日
 *    （按上海时区切日），从今天（或昨天）往回数连续段。
 * 3. 错题本：未订正的错题数 + 近 7 天新增，供首页"错题本"卡片使用。
 */

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
const SUBMISSION_CAP_MINUTES = 120;

const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function shanghaiDayKey(date: Date) {
  return dayKeyFormat.format(date);
}

/** 上海时区固定 UTC+8，没有夏令时，可以直接用毫秒偏移推算周一零点。 */
function shanghaiWeekStart(now: Date) {
  const [year, month, day] = shanghaiDayKey(now).split("-").map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  const weekday = new Date(utcMidnight).getUTCDay();
  const sinceMonday = (weekday + 6) % 7;
  return new Date(utcMidnight - 8 * 3_600_000 - sinceMonday * DAY);
}

function shiftDayKey(key: string, offset: number) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + offset * DAY)
    .toISOString()
    .slice(0, 10);
}

function submissionMinutes(
  rows: Array<{ startedAt: Date; submittedAt: Date | null }>,
  from: Date,
  to: Date,
) {
  let minutes = 0;
  for (const row of rows) {
    if (!row.submittedAt) continue;
    if (row.submittedAt < from || row.submittedAt >= to) continue;
    const span = (row.submittedAt.getTime() - row.startedAt.getTime()) / 60_000;
    if (span > 0) minutes += Math.min(span, SUBMISSION_CAP_MINUTES);
  }
  return minutes;
}

function answerMinutes(
  rows: Array<{ createdAt: Date; responseTimeMs: number | null }>,
  from: Date,
  to: Date,
) {
  let minutes = 0;
  for (const row of rows) {
    if (row.createdAt < from || row.createdAt >= to) continue;
    if (row.responseTimeMs && row.responseTimeMs > 0)
      minutes += Math.min(row.responseTimeMs / 60_000, 30);
  }
  return minutes;
}

/** 连续段：从今天往回数；今天还没有记录时，允许从昨天起算。 */
export function streakFromDays(days: Set<string>, now: Date) {
  const today = shanghaiDayKey(now);
  let cursor = days.has(today) ? today : shiftDayKey(today, -1);
  let streak = 0;
  while (days.has(cursor) && streak < WINDOW_DAYS) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const key of [...days].sort()) {
    run = previous && shiftDayKey(previous, 1) === key ? run + 1 : 1;
    previous = key;
    if (run > longest) longest = run;
  }
  return { days: streak, longest };
}

export type StudentHomePulse = {
  weekly: { minutes: number; previousMinutes: number };
  streak: { days: number; longest: number };
  lastActiveAt: Date | null;
  wrongBook: { open: number; newInWeek: number; lastReviewedAt: Date | null };
  pendingPractice: number;
  inProgress: Array<{
    submissionId: string;
    assignmentId: string;
    title: string;
    courseName: string | null;
    answered: number;
    total: number;
    lastSavedAt: Date | null;
    href: string;
    savedAt: Date;
  }>;
  finished: Array<{
    submissionId: string;
    assignmentId: string;
    title: string;
    courseName: string | null;
    score: number | null;
    maxScore: number | null;
    submittedAt: Date;
    graded: boolean;
    href: string;
  }>;
};

export async function getStudentHomePulse(
  studentId: string,
  now = new Date(),
): Promise<StudentHomePulse> {
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY);
  const weekStart = shanghaiWeekStart(now);
  const previousWeekStart = new Date(weekStart.getTime() - 7 * DAY);

  const [submissions, answers, events, wrong, pendingPractice, inProgress] =
    await Promise.all([
      prisma.submission.findMany({
        where: { studentId, submittedAt: { gte: since } },
        select: { startedAt: true, submittedAt: true },
      }),
      prisma.recommendationPracticeAnswer.findMany({
        where: {
          recommendation: { studentId },
          createdAt: { gte: since },
        },
        select: { createdAt: true, responseTimeMs: true },
      }),
      prisma.learningEvent.findMany({
        where: { studentId, occurredAt: { gte: since } },
        select: { occurredAt: true },
      }),
      prisma.wrongQuestion.findMany({
        where: { studentId },
        select: { isResolved: true, createdAt: true, lastReviewedAt: true },
      }),
      prisma.personalizedRecommendation.count({
        where: { studentId, status: "PENDING" },
      }),
      prisma.submission.findMany({
        where: { studentId, status: "IN_PROGRESS" },
        orderBy: [{ lastSavedAt: "desc" }, { startedAt: "desc" }],
        take: 3,
        select: {
          id: true,
          assignmentId: true,
          startedAt: true,
          lastSavedAt: true,
          _count: { select: { answers: true } },
          assignment: {
            select: {
              title: true,
              classroomId: true,
              classroom: {
                select: {
                  course: { select: { id: true, name: true } },
                },
              },
              _count: { select: { questions: true } },
            },
          },
        },
      }),
    ]);

  const recentFinished = await prisma.submission.findMany({
    where: {
      studentId,
      submittedAt: { not: null },
      status: { in: ["SUBMITTED", "GRADED"] },
    },
    orderBy: { submittedAt: "desc" },
    take: 2,
    select: {
      id: true,
      assignmentId: true,
      submittedAt: true,
      gradedAt: true,
      score: true,
      maxScore: true,
      assignment: {
        select: {
          title: true,
          classroomId: true,
          classroom: {
            select: { course: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  const days = new Set<string>();
  const activityAt: Date[] = [];
  for (const row of submissions)
    if (row.submittedAt) {
      days.add(shanghaiDayKey(row.submittedAt));
      activityAt.push(row.submittedAt);
    }
  for (const row of answers) {
    days.add(shanghaiDayKey(row.createdAt));
    activityAt.push(row.createdAt);
  }
  for (const row of events) {
    days.add(shanghaiDayKey(row.occurredAt));
    activityAt.push(row.occurredAt);
  }
  const lastActiveAt = activityAt.reduce<Date | null>(
    (latest, at) => (!latest || at > latest ? at : latest),
    null,
  );

  const weeklyMinutes =
    submissionMinutes(submissions, weekStart, now) +
    answerMinutes(answers, weekStart, now);
  const previousMinutes =
    submissionMinutes(submissions, previousWeekStart, weekStart) +
    answerMinutes(answers, previousWeekStart, weekStart);

  const openWrong = wrong.filter((row) => !row.isResolved);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const lastReviewedAt = wrong.reduce<Date | null>((latest, row) => {
    if (!row.lastReviewedAt) return latest;
    return !latest || row.lastReviewedAt > latest ? row.lastReviewedAt : latest;
  }, null);

  const scoped = (assignmentId: string, classroomId: string) =>
    `/student/assignments/${encodeURIComponent(assignmentId)}?${new URLSearchParams({ classroomId })}`;

  return {
    weekly: {
      minutes: Math.round(weeklyMinutes),
      previousMinutes: Math.round(previousMinutes),
    },
    streak: streakFromDays(days, now),
    lastActiveAt,
    wrongBook: {
      open: openWrong.length,
      newInWeek: openWrong.filter((row) => row.createdAt >= weekAgo).length,
      lastReviewedAt,
    },
    pendingPractice,
    inProgress: inProgress.map((row) => ({
      submissionId: row.id,
      assignmentId: row.assignmentId,
      title: row.assignment.title,
      courseName: row.assignment.classroom.course?.name ?? null,
      answered: row._count.answers,
      total: row.assignment._count.questions,
      lastSavedAt: row.lastSavedAt,
      href: `/student/submissions/${encodeURIComponent(row.id)}/answer?${new URLSearchParams({ classroomId: row.assignment.classroomId })}`,
      savedAt: row.lastSavedAt ?? row.startedAt,
    })),
    finished: recentFinished.flatMap((row) =>
      row.submittedAt
        ? [
            {
              submissionId: row.id,
              assignmentId: row.assignmentId,
              title: row.assignment.title,
              courseName: row.assignment.classroom.course?.name ?? null,
              score: row.score === null ? null : Number(row.score),
              maxScore: row.maxScore === null ? null : Number(row.maxScore),
              submittedAt: row.submittedAt,
              graded: row.gradedAt !== null,
              href: scoped(row.assignmentId, row.assignment.classroomId),
            },
          ]
        : [],
    ),
  };
}
