import "server-only";
import { z } from "zod";
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
function summarizePracticeDays(
  answers: Array<{ createdAt: Date; isCorrect: boolean }>,
) {
  const days = new Map<string, { answered: number; correct: number }>();
  for (const answer of answers) {
    const key = shanghaiDayKey(answer.createdAt);
    const day = days.get(key) ?? { answered: 0, correct: 0 };
    day.answered += 1;
    if (answer.isCorrect) day.correct += 1;
    days.set(key, day);
  }
  return [...days.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-8)
    .map(([key, day]) => ({
      id: `practice:${key}`,
      label: key.replace("-", "/"),
      answered: day.answered,
      correct: day.correct,
      rate: Math.round((day.correct / day.answered) * 100),
    }));
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
              session: { select: { classroomId: true } },
            },
          }),
          listPublishedExamScores(ids, studentId, now),
          prisma.recommendationPracticeAnswer.findMany({
            where: {
              createdAt: { lte: now },
              recommendation: {
                studentId,
                courseCycle: { is: { courseId: { in: courseIds } } },
              },
            },
            select: {
              createdAt: true,
              isCorrect: true,
              recommendation: {
                select: { courseCycle: { select: { courseId: true } } },
              },
            },
            orderBy: { createdAt: "asc" },
          }),
        ])
      : [[], [], [], []];
  const practiceByCourse = new Map<string, typeof practiceAnswers>();
  for (const answer of practiceAnswers) {
    const courseId = answer.recommendation.courseCycle?.courseId;
    if (!courseId) continue;
    const list = practiceByCourse.get(courseId) ?? [];
    list.push(answer);
    practiceByCourse.set(courseId, list);
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
    return {
      ...context,
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
      practiceHistory: summarizePracticeDays(
        practiceByCourse.get(context.course.id) ?? [],
      ),
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
