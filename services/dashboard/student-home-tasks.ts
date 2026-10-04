import { nextCourseSurveyChangeAt } from "@/services/course-surveys/availability";
import "server-only";

import { prisma } from "@/lib/prisma";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";

export async function getStudentHomeTasks(studentId: string) {
  const now = new Date();
  const [surveys, attendance] = await Promise.all([
    listStudentCourseSurveys(studentId),
    prisma.attendanceRecord.findMany({
      where: {
        studentId,
        currentStatus: "PENDING",
        session: {
          status: "OPEN",
          signInOpensAt: { lte: now },
          signInClosesAt: { gte: now },
          classroom: {
            status: "ACTIVE",
            memberships: { some: { studentId, status: "ACTIVE" } },
          },
        },
      },
      select: {
        id: true,
        session: {
          select: {
            title: true,
            startsAt: true,
            classroom: { select: { id: true, name: true } },
            signInClosesAt: true,
            course: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { session: { signInClosesAt: "asc" } },
    }),
  ]);
  return {
    surveys: surveys.filter((survey) => survey.availability === "OPEN"),
    scheduledSurveys: surveys.filter(
      (survey) => survey.availability === "SCHEDULED",
    ),
    nextSurveyChangeAt: nextCourseSurveyChangeAt(surveys, now),
    attendance,
  };
}
