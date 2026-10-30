import {
  courseSurveyAvailability,
  nextCourseSurveyChangeAt,
} from "@/services/course-surveys/availability";
import "server-only";

import { prisma } from "@/lib/prisma";
import { listStudentCourseSurveys } from "@/services/course-surveys/service";

export async function getStudentHomeTasks(studentId: string, now = new Date()) {
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
  const currentSurveys = surveys.map((survey) => {
    const availability = courseSurveyAvailability(survey, now);
    return { ...survey, availability, isOpen: availability === "OPEN" };
  });
  return {
    surveys: currentSurveys.filter((survey) => survey.availability === "OPEN"),
    scheduledSurveys: currentSurveys.filter(
      (survey) => survey.availability === "SCHEDULED",
    ),
    nextSurveyChangeAt: nextCourseSurveyChangeAt(currentSurveys, now),
    attendance,
  };
}
