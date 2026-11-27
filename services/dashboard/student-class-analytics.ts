import "server-only";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { listStudentCourseEvaluationContexts } from "@/services/gradebook/service";
import { assignmentReportingWhere } from "@/services/assignments/reporting";
import { latestEffectiveSubmissions } from "@/services/assignments/latest-submissions";
import { hundredPointScore } from "@/services/assignments/presentation";
import { oneDecimal } from "@/services/exams/analysis-statistics";
import { listPublishedExamScores } from "@/services/course-analytics/exam-scores";
export const studentClassAnalyticsQuery = z
  .object({
    courseId: z.string().cuid().optional(),
    classroomId: z.string().cuid().optional(),
  })
  .strict();
export type StudentHomeExamResult = {
  assignmentId: string;
  examId: string;
  courseId: string;
  classroomId: string;
  courseName: string;
  classroomName: string;
  title: string;
  endsAt: Date;
  percentage: number | null;
  resultState: "PUBLISHED" | "AWAITING" | "MISSED" | "RECORDED";
  publishedSubmissionId: string | null;
};

/**
 * 自主练习按天聚合。
 *
 * 练习记录来自课程级的推荐练习作答（RecommendationPracticeAnswer），口径与
 * 教学班的作业/考试不同：按天合并为一根柱，只表达「当天正确率」与题量，
 * 不并入成绩均分，也不参与提交率。前端需要明确标注这是练习口径。
 *
 * 取样口径是「最近有记录的 8 天」而不是「最近 N 天」：学生停练两三周后，
 * 仍应看到上一次练习的痕迹，而不是一张空图。
 */
function shanghaiDayKey(date: Date) {
  return new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(5, 10);
}
type PracticeDay = {
  courseId: string;
  day: string;
  answered: number;
  correct: number;
  lastAnswerAt: Date;
};

async function listRecentPracticeDays(
  studentId: string,
  courseIds: string[],
  now: Date,
) {
  if (!courseIds.length) return [];
  // Aggregate in PostgreSQL so a long practice history sends at most eight rows per course.
  return prisma.$queryRaw<PracticeDay[]>`
    WITH days AS (
      SELECT cycle."courseId",
        (answer."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Shanghai')::date AS day,
        COUNT(*)::int AS answered,
        COUNT(*) FILTER (WHERE answer."isCorrect")::int AS correct,
        MAX(answer."createdAt") AS "lastAnswerAt"
      FROM "RecommendationPracticeAnswer" AS answer
      JOIN "PersonalizedRecommendation" AS recommendation
        ON recommendation.id = answer."recommendationId"
      JOIN "CourseRecommendationCycle" AS cycle
        ON cycle.id = recommendation."courseCycleId"
      WHERE recommendation."studentId" = ${studentId}
        AND cycle."courseId" IN (${Prisma.join(courseIds)})
        AND answer."createdAt" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY cycle."courseId", day
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY "courseId" ORDER BY day DESC) AS day_rank
      FROM days
    )
    SELECT "courseId", TO_CHAR(day, 'YYYY-MM-DD') AS day, answered, correct, "lastAnswerAt"
    FROM ranked
    WHERE day_rank <= 8
    ORDER BY "courseId", day
  `;
}

/**
 * 出勤周历条：最近 7 天（含今天）每天一格。
 *
 * 一天可能有多次课，按「越严重越优先」合并为一种状态（缺勤 > 迟到 > 早退 >
 * 请假 > 待确认 > 正常），避免同一天多格却只有一格宽。没有课的日子返回 null，
 * 前端画灰格并说明「无课不按缺勤计」。
 */
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const ATTENDANCE_SEVERITY: Record<string, number> = {
  ABSENT: 6,
  LATE: 5,
  EARLY_LEAVE: 4,
  LEAVE: 3,
  PENDING: 2,
  PRESENT: 1,
};
function buildAttendanceWeek(
  records: Array<{ currentStatus: string; session: { startsAt: Date } }>,
  now: Date,
) {
  const base = new Date(now.getTime() + 8 * 3_600_000);
  return Array.from({ length: 7 }, (_, index) => {
    const offset = 6 - index;
    const dayStart = new Date(
      Date.UTC(
        base.getUTCFullYear(),
        base.getUTCMonth(),
        base.getUTCDate() - offset,
      ) -
        8 * 3_600_000,
    );
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);
    const statuses = records
      .filter(
        (record) =>
          record.session.startsAt >= dayStart &&
          record.session.startsAt < dayEnd,
      )
      .map((record) => record.currentStatus)
      .sort(
        (left, right) =>
          (ATTENDANCE_SEVERITY[right] ?? 0) - (ATTENDANCE_SEVERITY[left] ?? 0),
      );
    const shanghai = new Date(dayStart.getTime() + 8 * 3_600_000);
    return {
      key: shanghaiDayKey(dayStart),
      weekday: WEEKDAY_LABELS[shanghai.getUTCDay()],
      status: (statuses[0] ?? null) as string | null,
    };
  });
}

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
  const courseIds = [...new Set(visible.map((x) => x.course.id))];
  const [assignments, attendance, publishedExamScores, practiceAnswers] =
    ids.length
      ? await Promise.all([
          prisma.assignment.findMany({
            where: {
              classroomId: { in: ids },
              deletedAt: null,
              ...assignmentReportingWhere("ALL", now),
              OR: [
                { examSessionId: null },
                {
                  status: { in: ["PUBLISHED", "CLOSED"] },
                  examSession: { cancelledAt: null, endsAt: { lte: now } },
                },
              ],
            },
            select: {
              id: true,
              classroomId: true,
              title: true,
              dueAt: true,
              examSession: {
                select: { id: true, type: true, endsAt: true, courseId: true },
              },
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
              signedAt: true,
              session: { select: { classroomId: true, startsAt: true } },
            },
          }),
          listPublishedExamScores(ids, studentId, now),
          listRecentPracticeDays(studentId, courseIds, now),
        ])
      : [[], [], [], []];
  const practiceByCourse = new Map<string, typeof practiceAnswers>();
  for (const day of practiceAnswers) {
    const list = practiceByCourse.get(day.courseId) ?? [];
    list.push(day);
    practiceByCourse.set(day.courseId, list);
  }
  const examResults: StudentHomeExamResult[] = [];
  const examScores: number[] = [];
  const classes = visible.map((context) => {
    const work = assignments.filter(
      (x) =>
        x.classroomId === context.classroom.id &&
        (!x.examSession || x.examSession.courseId === context.course.id),
    );
    const gradeScores = publishedExamScores.filter(
      (item) => item.classroomId === context.classroom.id,
    );
    const gradeByAssignment = new Map(
      gradeScores
        .filter((item) => item.assignmentId)
        .map((item) => [item.assignmentId, item]),
    );
    const rows = work.map((assignment) => {
      const submission = latestEffectiveSubmissions(assignment.submissions)[0];
      const publishedGrade = gradeByAssignment.get(assignment.id);
      return {
        assignment,
        submission,
        percentage: publishedGrade
          ? publishedGrade.status === "SCORED"
            ? hundredPointScore(publishedGrade.score, publishedGrade.maxScore)
            : null
          : submission?.status === "PUBLISHED"
            ? hundredPointScore(
                submission.score?.toNumber() ?? null,
                submission.maxScore?.toNumber() ?? null,
              )
            : null,
        grade: publishedGrade ?? null,
      };
    });
    for (const row of rows)
      if (
        row.percentage !== null &&
        (row.percentage < 0 || row.percentage > 100)
      )
        row.percentage = null;

    const assignmentRows = rows.filter((row) => !row.assignment.examSession);
    const assignmentSubmitted = assignmentRows.filter(
      (row) => row.submission,
    ).length;
    const assignmentOverdue = assignmentRows.filter(
      (row) =>
        !row.submission && row.assignment.dueAt && row.assignment.dueAt <= now,
    ).length;
    for (const row of rows) {
      const exam = row.assignment.examSession;
      if (!exam) continue;
      const resultState =
        row.percentage !== null
          ? "PUBLISHED"
          : row.grade && row.grade.status !== "ABSENT"
            ? "RECORDED"
            : row.submission
              ? "AWAITING"
              : "MISSED";
      const percentage =
        row.percentage === null ? null : oneDecimal(row.percentage);
      examResults.push({
        assignmentId: row.assignment.id,
        examId: exam.id,
        courseId: context.course.id,
        classroomId: context.classroom.id,
        courseName: context.course.name,
        classroomName: context.classroom.name,
        title: row.assignment.title,
        endsAt: exam.endsAt,
        percentage,
        resultState,
        publishedSubmissionId:
          row.submission?.status === "PUBLISHED" && percentage !== null
            ? row.submission.id
            : null,
      });
      if (row.percentage !== null) examScores.push(row.percentage);
    }
    const submitted = rows.filter((x) => x.submission).length;
    const gradeOnly = gradeScores.filter(
      (item) =>
        !item.assignmentId ||
        !rows.some(
          (row) => row.assignment.id === item.assignmentId && row.submission,
        ),
    );
    const gradeOnlyScored = gradeOnly.flatMap((item) => {
      const percentage =
        item.status === "SCORED"
          ? hundredPointScore(item.score, item.maxScore)
          : null;
      return percentage === null ? [] : [{ item, percentage }];
    });
    const graded = rows.filter(
      (x) =>
        x.submission &&
        x.percentage !== null &&
        x.percentage >= 0 &&
        x.percentage <= 100,
    );
    const scores = [
      ...graded.map((item) => item.percentage ?? 0),
      ...gradeOnlyScored.map((item) => item.percentage),
    ];
    /**
     * 成绩序列先合并、再按口径截取。
     *
     * 混在一起截取最近 8 项时，连续 8 份新作业会把已有考试挤出样本，
     * 学生在「考试」视图里会看到空图并误以为没有考试。
     * 这里保留一份完整序列（按时间升序），全部 / 作业 / 考试各自取最近 8 项。
     * 只做内存分组，不额外查询。
     */
    const scoreTimeline = graded
      .filter((x) => x.submission)
      .flatMap((x) =>
        x.submission && x.percentage !== null
          ? [
              {
                id: x.submission.id,
                title: x.assignment.title,
                percentage: x.percentage,
                submittedAt: x.submission.submittedAt,
                kind: x.assignment.examSession?.type ?? "ASSIGNMENT",
                href: x.grade
                  ? `/student/results?view=course&courseId=${x.grade.courseId}&classroomId=${x.grade.classroomId}`
                  : `/student/submissions/${x.submission.id}/result`,
              },
            ]
          : [],
      )
      .concat(
        gradeOnlyScored.map(({ item, percentage }) => ({
          id: `grade:${item.id}`,
          title: item.title,
          percentage,
          submittedAt: item.publishedAt,
          kind: item.type,
          href: `/student/results?view=course&courseId=${item.courseId}&classroomId=${item.classroomId}`,
        })),
      )
      .sort(
        (a, b) =>
          (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0) ||
          a.id.localeCompare(b.id),
      );
    const isExamKind = (kind: string) => kind !== "ASSIGNMENT";
    const lastEight = <T>(items: T[]) => items.slice(-8);
    const records = attendance.filter(
      (x) => x.session.classroomId === context.classroom.id,
    );
    const practices = practiceByCourse.get(context.course.id);
    const lastClassActivityAt = rows.reduce(
      (latest, { submission }) =>
        Math.max(latest, submission?.submittedAt?.getTime() ?? 0),
      records.reduce(
        (latest, { signedAt }) => Math.max(latest, signedAt?.getTime() ?? 0),
        0,
      ),
    );
    return {
      ...context,
      lastClassActivityAt,
      lastPracticeAt: practices?.at(-1)?.lastAnswerAt.getTime() ?? 0,
      assignmentProgress: {
        total: assignmentRows.length,
        submitted: assignmentSubmitted,
        overdue: assignmentOverdue,
      },
      total: work.length,
      submitted,
      unsubmitted: work.length - submitted,
      overdue: rows.filter(
        (x) => !x.submission && x.assignment.dueAt && x.assignment.dueAt <= now,
      ).length,
      completion: work.length
        ? Math.round((submitted / work.length) * 100)
        : null,
      average: scores.length
        ? Math.round(
            (scores.reduce((n, value) => n + value, 0) / scores.length) * 100,
          ) / 100
        : null,
      gradedCount: scores.length,
      publishedCount: rows.filter(
        (x) => x.submission && (x.submission.status === "PUBLISHED" || x.grade),
      ).length,
      scoreHistory: lastEight(scoreTimeline),
      /*
        按口径分组供页面切换使用：全部为混合最近 8 项，
        作业 / 考试各自保留最近 8 项，避免互相挤出样本。
      */
      scoreHistoryByKind: {
        assignment: lastEight(
          scoreTimeline.filter((item) => !isExamKind(item.kind)),
        ),
        exam: lastEight(scoreTimeline.filter((item) => isExamKind(item.kind))),
      },
      /*
        练习口径独立：课程级、按天聚合、不计入均分与提交率。
        没有记录的课程返回空数组，由图表给出空态，不伪造 0 分。
      */
      practiceHistory: (practices ?? []).map(({ day, answered, correct }) => ({
        id: `practice:${day}`,
        label: day.slice(5).replace("-", "/"),
        answered,
        correct,
        rate: Math.round((correct / answered) * 100),
      })),
      awaitingRelease: rows.filter(
        (x) => x.submission && x.submission.status !== "PUBLISHED" && !x.grade,
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
      attendanceWeek: buildAttendanceWeek(records, now),
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
                  status: x.grade
                    ? ("PUBLISHED" as const)
                    : x.submission.status,
                  kind: x.assignment.examSession?.type ?? "ASSIGNMENT",
                  href: x.grade
                    ? `/student/results?view=course&courseId=${x.grade.courseId}&classroomId=${x.grade.classroomId}`
                    : `/student/submissions/${x.submission.id}/result`,
                  gradeStatus: x.grade?.status ?? null,
                },
              ]
            : [],
        )
        .concat(
          gradeOnly.map((item) => ({
            id: `grade:${item.id}`,
            title: item.title,
            submittedAt: item.publishedAt,
            percentage:
              item.status === "SCORED"
                ? hundredPointScore(item.score, item.maxScore)
                : null,
            status: "PUBLISHED" as const,
            kind: item.type,
            href: `/student/results?view=course&courseId=${item.courseId}&classroomId=${item.classroomId}`,
            gradeStatus: item.status,
          })),
        )
        .sort(
          (a, b) =>
            (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0),
        )
        .slice(0, 8),
    };
  });
  examResults.sort(
    (a, b) =>
      b.endsAt.getTime() - a.endsAt.getTime() ||
      a.assignmentId.localeCompare(b.assignmentId),
  );
  return {
    contexts,
    classes,
    query,
    updatedAt: now,
    exams: {
      recent: examResults[0] ?? null,
      missed: examResults.filter((result) => result.resultState === "MISSED")
        .length,
      scoredCount: examScores.length,
      average: examScores.length
        ? oneDecimal(
            examScores.reduce((sum, score) => sum + score, 0) /
              examScores.length,
          )
        : null,
    },
  };
}

export type StudentClassAnalysis = Awaited<
  ReturnType<typeof getStudentClassAnalytics>
>["classes"][number];
