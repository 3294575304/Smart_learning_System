import "server-only";

import {
  AssignmentStatus,
  MembershipStatus,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { calculateCourseAssignmentStatistics } from "@/services/course-analytics/assignment-statistics";

const EFFECTIVE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  SubmissionStatus.SUBMITTED,
  SubmissionStatus.PENDING_REVIEW,
  SubmissionStatus.GRADED,
  SubmissionStatus.PUBLISHED,
];

export async function getTeacherCourseAnalytics(
  teacherId: string,
  courseId: string,
  classroomId?: string,
) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      courseNo: true,
      term: true,
      classrooms: {
        where: {
          status: "ACTIVE",
          ...(classroomId ? { id: classroomId } : {}),
        },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          memberships: {
            where: { status: MembershipStatus.ACTIVE },
            select: { studentId: true },
          },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  if (classroomId && course.classrooms.length === 0) {
    throw new ResourceNotFoundError("班级不存在");
  }

  const activeStudentIdsByClassroom = new Map(
    course.classrooms.map((classroom) => [
      classroom.id,
      new Set(classroom.memberships.map((membership) => membership.studentId)),
    ]),
  );
  const studentIds = [
    ...new Set(
      course.classrooms.flatMap((classroom) =>
        classroom.memberships.map((membership) => membership.studentId),
      ),
    ),
  ];

  const assignments = await prisma.assignment.findMany({
    where: {
      teacherId,
      status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
      classroom: {
        courseId,
        ...(classroomId ? { id: classroomId } : {}),
      },
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    select: { id: true, classroomId: true, status: true },
  });

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const submissions =
    assignmentIds.length > 0 && studentIds.length > 0
      ? await prisma.submission.findMany({
          where: {
            assignmentId: { in: assignmentIds },
            studentId: { in: studentIds },
            status: { in: EFFECTIVE_SUBMISSION_STATUSES },
          },
          orderBy: [
            { assignmentId: "asc" },
            { studentId: "asc" },
            { attemptNumber: "desc" },
            { submittedAt: "desc" },
            { id: "desc" },
          ],
          select: {
            id: true,
            assignmentId: true,
            studentId: true,
            attemptNumber: true,
            status: true,
            submittedAt: true,
            score: true,
            maxScore: true,
          },
        })
      : [];

  const assignmentStatistics = calculateCourseAssignmentStatistics({
    assignments,
    activeStudentIdsByClassroom,
    submissions: submissions.map((submission) => ({
      ...submission,
      score: submission.score?.toNumber() ?? null,
      maxScore: submission.maxScore?.toNumber() ?? null,
    })),
  });

  return {
    course: {
      id: course.id,
      name: course.name,
      courseNo: course.courseNo,
      term: course.term,
    },
    assignmentStatistics,
  };
}

export type TeacherCourseAnalytics = Awaited<
  ReturnType<typeof getTeacherCourseAnalytics>
>;
