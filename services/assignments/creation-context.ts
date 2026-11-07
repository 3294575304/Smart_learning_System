import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assignmentReportingWhere } from "./reporting";

export function assignmentEditorClassroomWhere(teacherId: string) {
  return {
    teacherId,
    status: "ACTIVE",
    OR: [
      { courseId: null },
      { course: { teacherId, status: { not: "ARCHIVED" } } },
    ],
  } satisfies Prisma.ClassroomWhereInput;
}

export async function getAssignmentCreationContext(
  teacherId: string,
  classroomId?: string,
  now = new Date(),
) {
  const eligibleClassrooms = assignmentEditorClassroomWhere(teacherId);
  const [recentDrafts, history] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        teacherId,
        status: "DRAFT",
        deletedAt: null,
        ...(classroomId ? { classroomId } : {}),
        classroom: eligibleClassrooms,
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        classroom: { select: { name: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 3,
    }),
    prisma.classroom.findMany({
      where: eligibleClassrooms,
      select: {
        id: true,
        assignments: {
          where: {
            teacherId,
            deletedAt: null,
            ...assignmentReportingWhere("ALL", now),
          },
          select: { title: true, category: true, publishedAt: true },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          take: 1,
        },
      },
    }),
  ]);

  return {
    recentDrafts,
    lastPublishedByClassroom: Object.fromEntries(
      history.flatMap(({ id, assignments: [assignment] }) =>
        assignment?.publishedAt
          ? [
              [
                id,
                {
                  ...assignment,
                  publishedAt: assignment.publishedAt.toISOString(),
                },
              ] as const,
            ]
          : [],
      ),
    ),
  };
}

export function canCopyHistoricalAssignment(
  assignment: {
    status: string;
    publishedAt: Date | null;
    dueAt: Date | null;
    classroom: { status: string };
  },
  now = new Date(),
) {
  return (
    ["PUBLISHED", "CLOSED", "ARCHIVED", "REVOKED"].includes(
      assignment.status,
    ) &&
    assignment.publishedAt !== null &&
    assignment.publishedAt <= now &&
    (assignment.status !== "PUBLISHED" ||
      assignment.classroom.status !== "ACTIVE" ||
      (assignment.dueAt !== null && assignment.dueAt <= now))
  );
}

export async function getAssignmentCopyTargets(
  teacherId: string,
  sourceClassroomId: string,
  hasQuestions: boolean,
  hasResources: boolean,
) {
  const source = await prisma.classroom.findFirst({
    where: { id: sourceClassroomId, teacherId },
    select: {
      courseId: true,
      course: { select: { questionCategoryId: true } },
    },
  });
  if (!source) return [];
  const rooms = await prisma.classroom.findMany({
    where: {
      ...assignmentEditorClassroomWhere(teacherId),
      ...(hasResources
        ? { courseId: source.courseId }
        : hasQuestions && source.course
          ? {
              AND: [
                {
                  course: {
                    questionCategoryId: source.course.questionCategoryId,
                  },
                },
              ],
            }
          : {}),
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      course: { select: { name: true, term: true } },
    },
  });
  return rooms.map((room) => ({
    id: room.id,
    label: room.course
      ? `${room.name} · ${room.course.name} · ${room.course.term}`
      : room.name,
  }));
}
