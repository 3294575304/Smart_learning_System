import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";
import { assignmentReportingWhere } from "@/services/assignments/reporting";
import { latestEffectiveSubmissions } from "@/services/assignments/latest-submissions";
import { hundredPointScore } from "@/services/assignments/presentation";
export const studentClassAnalyticsQuery = z
  .object({
    courseId: z.string().cuid().optional(),
    classroomId: z.string().cuid().optional(),
  })
  .strict();
export async function getStudentClassAnalytics(
  studentId: string,
  rawQuery: unknown,
  now = new Date(),
) {
  const query = studentClassAnalyticsQuery.parse(rawQuery);
  const contexts = await listStudentCourseEvaluationContexts(studentId);
  if (query.courseId && !contexts.some((x) => x.course.id === query.courseId))
    throw new ResourceNotFoundError("课程不存在或无权访问");
  if (
    query.classroomId &&
    !contexts.some(
      (x) =>
        x.classroom.id === query.classroomId &&
        (!query.courseId || x.course.id === query.courseId),
    )
  )
    throw new ResourceNotFoundError("教学班不存在或与课程不匹配");
  const visible = contexts.filter(
    (x) =>
      (!query.courseId || x.course.id === query.courseId) &&
      (!query.classroomId || x.classroom.id === query.classroomId),
  );
  const ids = visible.map((x) => x.classroom.id);
  const [assignments, attendance] = ids.length
    ? await Promise.all([
        prisma.assignment.findMany({
          where: {
            classroomId: { in: ids },
            ...assignmentReportingWhere("ALL", now),
          },
          select: {
            id: true,
            classroomId: true,
            title: true,
            dueAt: true,
            submissions: {
              where: { studentId },
              select: {
                id: true,
                studentId: true,
                attemptNumber: true,
                status: true,
                submittedAt: true,
                score: true,
                maxScore: true,
              },
            },
          },
        }),
        prisma.attendanceRecord.findMany({
          where: {
            studentId,
            session: {
              classroomId: { in: ids },
              status: { not: "CANCELLED" },
              startsAt: { lte: now },
            },
          },
          select: {
            currentStatus: true,
            session: { select: { classroomId: true } },
          },
        }),
      ])
    : [[], []];
  const classes = visible.map((context) => {
    const work = assignments.filter(
      (x) => x.classroomId === context.classroom.id,
    );
    const rows = work.map((assignment) => {
      const submission = latestEffectiveSubmissions(assignment.submissions)[0];
      return {
        assignment,
        submission,
        percentage:
          submission?.status === "PUBLISHED"
            ? hundredPointScore(
                submission.score?.toNumber() ?? null,
                submission.maxScore?.toNumber() ?? null,
              )
            : null,
      };
    });
    for (const row of rows)
      if (
        row.percentage !== null &&
        (row.percentage < 0 || row.percentage > 100)
      )
        row.percentage = null;
    const submitted = rows.filter((x) => x.submission).length;
    const graded = rows.filter(
      (x) => x.percentage !== null && x.percentage >= 0 && x.percentage <= 100,
    );
    const records = attendance.filter(
      (x) => x.session.classroomId === context.classroom.id,
    );
    return {
      ...context,
      total: work.length,
      submitted,
      unsubmitted: work.length - submitted,
      overdue: rows.filter(
        (x) => !x.submission && x.assignment.dueAt && x.assignment.dueAt <= now,
      ).length,
      completion: work.length
        ? Math.round((submitted / work.length) * 100)
        : null,
      average: graded.length
        ? Math.round(
            (graded.reduce((n, x) => n + (x.percentage ?? 0), 0) /
              graded.length) *
              100,
          ) / 100
        : null,
      gradedCount: graded.length,
      publishedCount: rows.filter((x) => x.submission?.status === "PUBLISHED")
        .length,
      scoreHistory: graded
        .filter((x) => x.submission)
        .sort(
          (a, b) =>
            (b.submission?.submittedAt?.getTime() ?? 0) -
              (a.submission?.submittedAt?.getTime() ?? 0) ||
            a.assignment.id.localeCompare(b.assignment.id),
        )
        .slice(0, 8)
        .reverse()
        .flatMap((x) =>
          x.submission && x.percentage !== null
            ? [
                {
                  id: x.submission.id,
                  title: x.assignment.title,
                  percentage: x.percentage,
                  submittedAt: x.submission.submittedAt,
                },
              ]
            : [],
        ),
      awaitingRelease: rows.filter(
        (x) => x.submission && x.submission.status !== "PUBLISHED",
      ).length,
      attendance: {
        present: records.filter((x) => x.currentStatus === "PRESENT").length,
        late: records.filter((x) => x.currentStatus === "LATE").length,
        earlyLeave: records.filter((x) => x.currentStatus === "EARLY_LEAVE")
          .length,
        leave: records.filter((x) => x.currentStatus === "LEAVE").length,
        absent: records.filter((x) => x.currentStatus === "ABSENT").length,
        pending: records.filter((x) => x.currentStatus === "PENDING").length,
        total: records.length,
      },
      recent: rows
        .filter((x) => x.submission)
        .sort(
          (a, b) =>
            (b.submission?.submittedAt?.getTime() ?? 0) -
              (a.submission?.submittedAt?.getTime() ?? 0) ||
            a.assignment.id.localeCompare(b.assignment.id),
        )
        .slice(0, 8)
        .flatMap((x) =>
          x.submission
            ? [
                {
                  id: x.submission.id,
                  title: x.assignment.title,
                  submittedAt: x.submission.submittedAt,
                  percentage: x.percentage,
                  status: x.submission.status,
                },
              ]
            : [],
        ),
    };
  });
  return { contexts, classes, query, updatedAt: now };
}

export type StudentClassAnalysis = Awaited<
  ReturnType<typeof getStudentClassAnalytics>
>["classes"][number];
