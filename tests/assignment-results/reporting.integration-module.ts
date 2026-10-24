import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type {
  AssignmentStatus,
  ClassroomStatus,
  SubmissionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { listTeacherResultsOverview } from "@/services/assignment-results/service";
import { getTeacherReportingScope } from "@/services/assignment-results/scope";
import { teacherResultsOverviewQuerySchema } from "@/services/assignment-results/schemas";
import { getTeacherCourseAnalytics } from "@/services/course-analytics/service";
import {
  listTeacherStudentAssignments,
  getTeacherStudentAssignments,
} from "@/services/assignments/student-service";
import {
  teacherStudentQuerySchema,
  teacherStudentDetailQuerySchema,
} from "@/services/assignments/student-query";
import { getTeacherAssignmentResults } from "@/services/assignment-results/service";
import { assignmentResultsQuerySchema } from "@/services/assignment-results/schemas";

export async function verifyAssignmentReporting(input: {
  teacherId: string;
  otherTeacherId: string;
  studentId: string;
  lateStudentId: string;
  courseId: string;
  otherCourseId: string;
}) {
  const now = new Date("2026-10-24T08:00:00Z");
  const past = new Date("2026-10-01T00:00:00Z");
  const future = new Date(now.getTime() + 86400000);
  const source = await prisma.course.findUniqueOrThrow({
    where: { id: input.courseId },
  });
  const course = await prisma.course.create({
    data: {
      teacherId: input.teacherId,
      templateId: source.templateId,
      questionCategoryId: source.questionCategoryId,
      name: "作业统计范围专项",
      courseNo: randomUUID(),
      term: "2026",
    },
  });
  const removed = await prisma.user.findFirstOrThrow({
    where: {
      role: "STUDENT",
      id: { notIn: [input.studentId, input.lateStudentId] },
    },
  });
  const room = (status: ClassroomStatus) =>
    prisma.classroom.create({
      data: {
        teacherId: input.teacherId,
        courseId: course.id,
        name: `统计${status}`,
        joinCode: randomUUID(),
        status,
        memberships: {
          create: [input.studentId, input.lateStudentId].map((studentId) => ({
            studentId,
            joinedAt: now,
            status: status === "ARCHIVED" ? "REMOVED" : "ACTIVE",
            endedAt: status === "ARCHIVED" ? now : null,
          })),
        },
      },
    });
  const active = await room("ACTIVE");
  const completed = await room("COMPLETED");
  const closed = await room("CLOSED");
  const archived = await room("ARCHIVED");
  await prisma.classMembership.create({
    data: {
      classroomId: active.id,
      studentId: removed.id,
      status: "REMOVED",
      endedAt: now,
    },
  });
  const assignment = (
    classroomId: string,
    title: string,
    status: AssignmentStatus = "PUBLISHED",
    publishedAt: Date | null = past,
    dueAt = now,
  ) =>
    prisma.assignment.create({
      data: {
        classroomId,
        teacherId: input.teacherId,
        title,
        status,
        publishedAt,
        dueAt,
        totalPoints: 100,
      },
    });
  const current = await assignment(active.id, "当前已截止");
  const ended = await assignment(active.id, "单独关闭", "CLOSED", past, future);
  const archivedAssignment = await assignment(
    active.id,
    "实际发布后归档",
    "ARCHIVED",
  );
  const completedAssignment = await assignment(completed.id, "结课班作业");
  const closedAssignment = await assignment(closed.id, "管理员关闭班作业");
  const legacyAssignment = await assignment(
    archived.id,
    "历史解散班作业",
    "ARCHIVED",
  );
  await assignment(
    active.id,
    "未开放",
    "PUBLISHED",
    future,
    new Date(future.getTime() + 86400000),
  );
  await assignment(active.id, "未发布归档", "ARCHIVED", null);
  await assignment(active.id, "草稿", "DRAFT");
  const submit = (
    assignmentId: string,
    studentId: string,
    status: SubmissionStatus,
    attemptNumber = 1,
    score: number | null = null,
    maxScore: number | null = null,
  ) =>
    prisma.submission.create({
      data: {
        assignmentId,
        studentId,
        status,
        attemptNumber,
        idempotencyKey: randomUUID(),
        startedAt: past,
        submittedAt: past,
        score,
        maxScore,
        // Deliberately stale to prove statistics normalize the immutable original score instead.
        percentage: score === null ? null : 99,
      },
    });
  await submit(current.id, input.studentId, "GRADED", 1, 15, 20);
  await submit(current.id, input.studentId, "IN_PROGRESS", 2);
  await submit(current.id, input.studentId, "WITHDRAWN", 3);
  await submit(current.id, removed.id, "PUBLISHED", 1, 100, 100);
  await submit(ended.id, input.studentId, "PENDING_REVIEW");
  await submit(completedAssignment.id, input.studentId, "PUBLISHED", 1, 50, 50);
  await submit(legacyAssignment.id, input.studentId, "PUBLISHED", 1, 100, 100);

  const query = (
    section: "ALL" | "CURRENT" | "HISTORY",
    classroomId?: string,
  ) =>
    teacherResultsOverviewQuerySchema.parse({
      courseId: course.id,
      section,
      classroomId,
      pageSize: 30,
    });
  const all = await listTeacherResultsOverview(
    input.teacherId,
    query("ALL"),
    now,
  );
  assert.equal(all.items.length, 6);
  assert.equal(
    all.items.find((item) => item.id === current.id)?.averagePercentage,
    75,
  );
  assert.equal(
    all.items.find((item) => item.id === current.id)?.highestPercentage,
    75,
  );
  const currentRows = await listTeacherResultsOverview(
    input.teacherId,
    query("CURRENT"),
    now,
  );
  assert.deepEqual(
    currentRows.items.map((item) => item.id),
    [current.id],
  );
  const history = await listTeacherResultsOverview(
    input.teacherId,
    query("HISTORY"),
    now,
  );
  assert.deepEqual(
    new Set(history.items.map((item) => item.id)),
    new Set([
      ended.id,
      archivedAssignment.id,
      completedAssignment.id,
      closedAssignment.id,
      legacyAssignment.id,
    ]),
  );
  for (const section of ["ALL", "CURRENT", "HISTORY"] as const) {
    const overview = await listTeacherResultsOverview(
      input.teacherId,
      query(section),
      now,
    );
    const analytics = await getTeacherCourseAnalytics(
      input.teacherId,
      course.id,
      undefined,
      { section, now },
    );
    const stats = analytics.assignmentStatistics;
    assert.equal(stats.assignmentCount, overview.items.length);
    assert.ok(
      analytics.recentAssignments.every((item) =>
        overview.items.some((row) => row.id === item.id),
      ),
    );
    assert.equal(
      stats.eligibleSubmissionCount,
      overview.items.reduce((sum, item) => sum + item.studentCount, 0),
    );
    assert.equal(
      stats.completedSubmissionCount,
      overview.items.reduce((sum, item) => sum + item.submittedCount, 0),
    );
    assert.equal(
      stats.overdueCount,
      overview.items.reduce((sum, item) => sum + item.overdueCount, 0),
    );
    assert.equal(
      stats.pendingReviewCount,
      overview.items.reduce((sum, item) => sum + item.pendingReviewCount, 0),
    );
    assert.equal(
      stats.historicalSubmittedCount,
      overview.items.reduce(
        (sum, item) => sum + item.historicalSubmittedCount,
        0,
      ),
    );
    if (section === "ALL") {
      assert.equal(stats.eligibleSubmissionCount, 10);
      assert.equal(stats.overdueCount, 6);
      assert.equal(stats.historicalSubmittedCount, 2);
      assert.equal(stats.scoreRate, 92.9);
    }
    if (section === "HISTORY") assert.deepEqual(analytics.nextActions, []);
  }
  const selected = await getTeacherCourseAnalytics(
    input.teacherId,
    course.id,
    completed.id,
    { section: "HISTORY", now },
  );
  assert.equal(selected.assignmentStatistics.assignmentCount, 1);
  assert.equal(selected.assignmentStatistics.overdueCount, 1);
  assert.deepEqual(
    (
      await getTeacherCourseAnalytics(
        input.teacherId,
        course.id,
        completed.id,
        { section: "ALL", now },
      )
    ).nextActions,
    [],
  );
  const scope = await getTeacherReportingScope(
    input.teacherId,
    query("HISTORY", completed.id),
    now,
  );
  assert.ok(scope.some((item) => item.id === completed.id));
  await assert.rejects(
    () =>
      listTeacherResultsOverview(
        input.teacherId,
        query("CURRENT", completed.id),
        now,
      ),
    ResourceNotFoundError,
  );
  await assert.rejects(
    () => listTeacherResultsOverview(input.otherTeacherId, query("ALL"), now),
    ResourceNotFoundError,
  );
  await assert.rejects(
    () =>
      getTeacherCourseAnalytics(input.otherTeacherId, course.id, undefined, {
        section: "ALL",
        now,
      }),
    ResourceNotFoundError,
  );
  await assert.rejects(
    () =>
      listTeacherResultsOverview(
        input.teacherId,
        { ...query("ALL", active.id), courseId: input.otherCourseId },
        now,
      ),
    ResourceNotFoundError,
  );
  await assert.rejects(
    () =>
      listTeacherResultsOverview(
        input.teacherId,
        { ...query("ALL"), classroomId: "cm12345678901234567890123" },
        now,
      ),
    ResourceNotFoundError,
  );
  const empty = await listTeacherResultsOverview(
    input.teacherId,
    { ...query("ALL"), page: 2 },
    now,
  );
  assert.equal(empty.items.length, 0);
  const prefixNo = `000${Date.now()}`;
  for (const [index, studentId] of [
    input.studentId,
    input.lateStudentId,
  ].entries()) {
    await prisma.userProfile.upsert({
      where: { userId: studentId },
      create: {
        userId: studentId,
        displayName: "查询同名",
        studentNo: `${prefixNo}${index}`,
      },
      update: { displayName: "查询同名", studentNo: `${prefixNo}${index}` },
    });
  }
  const studentQuery = teacherStudentQuerySchema.parse({
    courseId: course.id,
    classroomId: active.id,
  });
  const studentRows = await listTeacherStudentAssignments(
    input.teacherId,
    studentQuery,
    now,
  );
  assert.equal(studentRows.pagination.total, 3);
  const matchingStatistics = (
    await getTeacherCourseAnalytics(input.teacherId, course.id, active.id, {
      section: "CURRENT",
      now,
    })
  ).assignmentStatistics;
  assert.equal(
    studentRows.items
      .filter((row) => row.active)
      .reduce((sum, row) => sum + (row.expected ?? 0), 0),
    matchingStatistics.eligibleSubmissionCount,
  );
  assert.equal(
    studentRows.items
      .filter((row) => row.active)
      .reduce((sum, row) => sum + row.submitted, 0),
    matchingStatistics.completedSubmissionCount,
  );
  const pendingStudents = await listTeacherStudentAssignments(
    input.teacherId,
    { ...studentQuery, section: "HISTORY", submissionFilter: "PENDING_REVIEW" },
    now,
  );
  assert.deepEqual(
    pendingStudents.items.map((row) => row.studentId),
    [input.studentId],
  );
  assert.equal(
    studentRows.items.find((row) => row.studentId === input.lateStudentId)
      ?.overdue,
    1,
  );
  assert.equal(
    studentRows.items.find((row) => row.studentId === removed.id)?.expected,
    null,
  );
  const overdueRows = await listTeacherStudentAssignments(
    input.teacherId,
    { ...studentQuery, submissionFilter: "OVERDUE" },
    now,
  );
  assert.deepEqual(
    overdueRows.items.map((row) => row.studentId),
    [input.lateStudentId],
  );
  const names = await listTeacherStudentAssignments(
    input.teacherId,
    { ...studentQuery, studentKeyword: "查询同名", pageSize: 1 },
    now,
  );
  assert.equal(names.pagination.total, 2);
  assert.equal(names.items.length, 1);
  assert.equal(names.pagination.totalPages, 2);
  const exact = await listTeacherStudentAssignments(
    input.teacherId,
    { ...studentQuery, studentKeyword: `${prefixNo}1` },
    now,
  );
  assert.deepEqual(
    exact.items.map((row) => row.studentId),
    [input.lateStudentId],
  );
  assert.equal(
    (
      await listTeacherStudentAssignments(
        input.teacherId,
        { ...studentQuery, studentKeyword: "%" },
        now,
      )
    ).pagination.total,
    0,
  );
  const detailQuery = teacherStudentDetailQuerySchema.parse(studentQuery);
  const detail = await getTeacherStudentAssignments(
    input.teacherId,
    input.studentId,
    detailQuery,
    now,
  );
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].percentage, 75);
  const missing = await getTeacherStudentAssignments(
    input.teacherId,
    input.lateStudentId,
    detailQuery,
    now,
  );
  assert.equal(missing.items[0].submissionId, null);
  assert.equal(missing.items[0].overdue, true);
  const historical = await getTeacherStudentAssignments(
    input.teacherId,
    removed.id,
    detailQuery,
    now,
  );
  assert.equal(historical.active, false);
  assert.equal(historical.items.length, 1);
  const evidence = await getTeacherAssignmentResults(
    input.teacherId,
    current.id,
    assignmentResultsQuerySchema.parse({ studentId: removed.id }),
  );
  assert.equal(evidence.selectedStudent?.student.id, removed.id);
  await assert.rejects(
    () =>
      getTeacherStudentAssignments(
        input.teacherId,
        removed.id,
        { ...detailQuery, section: "HISTORY" },
        now,
      ),
    ResourceNotFoundError,
  );
  await assert.rejects(
    () =>
      listTeacherStudentAssignments(input.otherTeacherId, studentQuery, now),
    ResourceNotFoundError,
  );
  await assert.rejects(
    () =>
      getTeacherStudentAssignments(
        input.teacherId,
        input.studentId,
        { ...detailQuery, courseId: input.otherCourseId },
        now,
      ),
    ResourceNotFoundError,
  );
  const emptyRoom = await prisma.classroom.create({
    data: {
      courseId: course.id,
      teacherId: input.teacherId,
      name: "零作业班",
      joinCode: randomUUID(),
      memberships: { create: { studentId: input.studentId } },
    },
  });
  const allStudents = await listTeacherStudentAssignments(
    input.teacherId,
    { ...studentQuery, classroomId: undefined },
    now,
  );
  assert.equal(
    allStudents.items.filter((row) => row.studentId === input.studentId).length,
    2,
  );
  assert.equal(
    allStudents.items.find((row) => row.classroomId === emptyRoom.id)?.expected,
    0,
  );
  console.log(
    "Student query integration passed: names, leading-zero IDs, exact search, zero tasks, missing submissions, historical read-only evidence, filters, pagination and ownership.",
  );
  console.log(
    "Assignment reporting integration passed: section parity, completed/closed/archived classes, late enrollment, historical evidence, normalized scores and ownership.",
  );
}
