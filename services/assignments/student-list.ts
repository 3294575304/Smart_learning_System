import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  getStudentClassroomContext,
  getStudentCourseContext,
} from "@/services/courses/student-access";
import type { StudentAssignmentListQuery } from "./schemas";
import type { StudentAssignmentListItem } from "./types";
import { studentAssignmentListWhere } from "./student-list-query";
import { studentWorkWindow } from "./work-window";
import { publishedResultsWhere } from "./work-access";

export const STUDENT_ASSIGNMENT_PAGE_SIZE = 8;
const include = Prisma.validator<Prisma.AssignmentInclude>()({
  classroom: {
    select: {
      status: true,
      name: true,
      courseId: true,
      memberships: { select: { studentId: true, status: true } },
    },
  },
  makeupGrants: { orderBy: { createdAt: "desc" } },
  _count: {
    select: { questions: true, submissions: { where: publishedResultsWhere } },
  },
  submissions: {
    orderBy: { attemptNumber: "desc" },
    select: {
      id: true,
      studentId: true,
      status: true,
      attemptNumber: true,
      score: true,
    },
  },
});

function studentInclude(studentId: string) {
  return {
    ...include,
    classroom: {
      select: {
        ...include.classroom.select,
        memberships: {
          where: { studentId },
          select: { studentId: true, status: true },
        },
      },
    },
    makeupGrants: {
      ...include.makeupGrants,
      where: { studentId, status: "ACTIVE" as const },
    },
    submissions: {
      ...include.submissions,
      where: { studentId, status: { not: "WITHDRAWN" as const } },
    },
  };
}
type Row = Prisma.AssignmentGetPayload<{
  include: ReturnType<typeof studentInclude>;
}>;

function listItem(
  assignment: Row,
  now: Date,
): StudentAssignmentListItem | null {
  if (!assignment.publishedAt || !assignment.dueAt) return null;
  const work = studentWorkWindow(
    assignment,
    assignment.makeupGrants,
    assignment._count.submissions > 0,
    now,
  );
  const historyOnly =
    assignment.status === "CLOSED" ||
    assignment.classroom.status !== "ACTIVE" ||
    assignment.classroom.memberships[0]?.status !== "ACTIVE";
  const draft = historyOnly
    ? undefined
    : assignment.submissions.find(
        (submission) => submission.status === "IN_PROGRESS",
      );
  const latest = assignment.submissions.find(
    (submission) => submission.status !== "IN_PROGRESS",
  );
  return {
    id: assignment.id,
    title: assignment.title,
    description: assignment.description ?? "",
    classroomName: assignment.classroom.name,
    totalPoints: assignment.totalPoints.toNumber(),
    questionCount: assignment._count.questions,
    publishedAt: assignment.publishedAt,
    dueAt: work.dueAt ?? assignment.dueAt,
    originalDueAt: assignment.dueAt,
    makeupKind: work.grant?.kind ?? null,
    canWrite: work.canWrite,
    allowResubmission: assignment.allowResubmission,
    attemptCount: assignment.submissions.filter(
      (submission) => submission.status !== "IN_PROGRESS",
    ).length,
    inProgressSubmissionId: draft?.id ?? null,
    latestSubmissionId: latest?.id ?? null,
    historyOnly,
    latestSubmissionStatus: latest?.status ?? null,
    latestPublishedScore:
      latest?.status === "PUBLISHED"
        ? (latest.score?.toNumber() ?? null)
        : null,
  };
}

async function validateScope(
  studentId: string,
  courseId?: string,
  classroomId?: string,
) {
  if (classroomId && courseId)
    await getStudentClassroomContext(studentId, classroomId, courseId);
  else if (classroomId) {
    // Historical MVP classrooms may have no course association.
    const membership = await prisma.classMembership.findFirst({
      where: { studentId, classroomId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!membership) throw new ResourceNotFoundError("教学班不存在。");
  } else if (courseId) await getStudentCourseContext(studentId, courseId);
}

async function listItems(
  studentId: string,
  status: StudentAssignmentListQuery["status"],
  now: Date,
  courseId?: string,
  classroomId?: string,
) {
  await validateScope(studentId, courseId, classroomId);
  const rows = await prisma.assignment.findMany({
    where: studentAssignmentListWhere(
      studentId,
      status,
      now,
      courseId,
      classroomId,
    ),
    include: studentInclude(studentId),
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
  });
  return rows.flatMap((row) => {
    const item = listItem(row, now);
    return item ? [item] : [];
  });
}

export function listStudentAssignments(
  studentId: string,
  courseId?: string,
  classroomId?: string,
  now = new Date(),
) {
  return listItems(studentId, "ALL", now, courseId, classroomId);
}

export function listStudentPendingAssignments(
  studentId: string,
  now = new Date(),
  courseId?: string,
  classroomId?: string,
) {
  return listItems(studentId, "TODO", now, courseId, classroomId);
}

export async function listStudentAssignmentPage(
  studentId: string,
  query: StudentAssignmentListQuery,
  courseId?: string,
  classroomId?: string,
  now = new Date(),
) {
  await validateScope(studentId, courseId, classroomId);
  const where = studentAssignmentListWhere(
    studentId,
    query.status,
    now,
    courseId,
    classroomId,
  );
  return prisma.$transaction(
    async (tx) => {
      const total = await tx.assignment.count({ where });
      const totalPages = Math.ceil(total / STUDENT_ASSIGNMENT_PAGE_SIZE);
      const page = Math.min(query.page, Math.max(totalPages, 1));
      const rows = await tx.assignment.findMany({
        where,
        include: studentInclude(studentId),
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: STUDENT_ASSIGNMENT_PAGE_SIZE,
        skip: (page - 1) * STUDENT_ASSIGNMENT_PAGE_SIZE,
      });
      return {
        items: rows.flatMap((row) => {
          const item = listItem(row, now);
          return item ? [item] : [];
        }),
        pagination: {
          page,
          pageSize: STUDENT_ASSIGNMENT_PAGE_SIZE,
          total,
          totalPages,
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

/** Notification pages resolve only the resources referenced by their own visible rows. */
export async function studentAssignmentActionContexts(
  studentId: string,
  ids: string[],
  now = new Date(),
) {
  if (!ids.length) return [];
  const rows = await prisma.assignment.findMany({
    where: {
      AND: [
        studentAssignmentListWhere(studentId, "ALL", now),
        { id: { in: ids } },
      ],
    },
    include: studentInclude(studentId),
  });
  return rows.flatMap((row) => {
    const assignment = listItem(row, now);
    return assignment
      ? [
          {
            assignment,
            courseId: row.classroom.courseId,
            classroomId: row.classroomId,
          },
        ]
      : [];
  });
}
