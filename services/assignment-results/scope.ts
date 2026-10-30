import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  assignmentReportingWhere,
  reportingClassroomMatches,
  type AssignmentReportingSection,
} from "@/services/assignments/reporting";

export async function getTeacherReportingScope(
  teacherId: string,
  query: {
    courseId?: string;
    classroomId?: string;
    section: AssignmentReportingSection;
  },
  now: Date,
) {
  const [classrooms, course] = await Promise.all([
    prisma.classroom.findMany({
      where: { teacherId },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        courseId: true,
        _count: {
          select: {
            assignments: {
              where: { teacherId, ...assignmentReportingWhere("HISTORY", now) },
            },
          },
        },
      },
    }),
    query.courseId
      ? prisma.course.findFirst({
          where: { id: query.courseId, teacherId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (query.courseId && !course)
    throw new ResourceNotFoundError("课程不存在或无权访问");
  const items = classrooms.map(({ _count, ...classroom }) => ({
    ...classroom,
    historicalAssignmentCount: _count.assignments,
  }));
  const selected = items.find(
    (classroom) => classroom.id === query.classroomId,
  );
  if (
    query.classroomId &&
    (!selected ||
      (query.courseId && selected.courseId !== query.courseId) ||
      !reportingClassroomMatches(selected, query.section))
  ) {
    throw new ResourceNotFoundError("班级不在当前课程或教学范围内，或无权访问");
  }
  return items;
}
