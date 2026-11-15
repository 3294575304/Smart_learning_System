import "server-only";

import { cache } from "react";

import { prisma } from "@/lib/prisma";

const DAY = 86_400_000;

/**
 * 侧栏底部那行"课程 / 教学班 · 第几周"。
 *
 * 周次只在这门课的学期编号是 `YYYY-YYYY-1|2` 这种标准写法时才算，
 * 春季学期按 2 月 15 日、秋季学期按 9 月 1 日作为第 1 周起点。
 * 编号不是标准写法（库里确实存在"123123"这种）就返回 null，
 * 侧栏只显示课程与教学班，不猜一个周次。
 */
export function termWeek(term: string | null | undefined, now = new Date()) {
  if (!term) return null;
  const match = /^(\d{4})-(\d{4})-([12])$/.exec(term.trim());
  if (!match) return null;
  const startYear = Number(match[1]);
  const startUtc =
    match[3] === "1"
      ? Date.UTC(startYear, 8, 1) // 9 月 1 日
      : Date.UTC(startYear + 1, 1, 15); // 次年 2 月 15 日
  const start = startUtc - 8 * 3_600_000;
  const elapsed = now.getTime() - start;
  if (elapsed < 0) return null;
  const week = Math.floor(elapsed / (7 * DAY)) + 1;
  return week > 0 && week <= 30 ? week : null;
}

export type StudentSidebarMeta = {
  courseName: string | null;
  classroomName: string | null;
  week: number | null;
};

export async function getStudentSidebarMeta(
  studentId: string,
  now = new Date(),
): Promise<StudentSidebarMeta> {
  const membership = await prisma.classMembership.findFirst({
    where: {
      studentId,
      status: "ACTIVE",
      classroom: {
        status: "ACTIVE",
        course: { status: { not: "ARCHIVED" } },
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      classroom: {
        select: {
          name: true,
          course: { select: { name: true, term: true } },
        },
      },
    },
  });
  if (!membership) return { courseName: null, classroomName: null, week: null };
  const course = membership.classroom.course;
  return {
    courseName: course?.name ?? null,
    classroomName: membership.classroom.name,
    week: termWeek(course?.term, now),
  };
}

/** 外壳与首页共用同一次查询（参数取整到分钟，见 sharedNowMs）。 */
export const getStudentSidebarMetaShared = cache(
  async (studentId: string, nowMs: number) =>
    getStudentSidebarMeta(studentId, new Date(nowMs)),
);
