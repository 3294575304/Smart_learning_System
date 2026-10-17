import type { CourseSurveyStatus } from "@prisma/client";

export type CourseSurveyAvailability =
  "SUBMITTED" | "CLOSED" | "EXPIRED" | "SCHEDULED" | "OPEN";

export function courseSurveyAvailability(
  survey: {
    status: CourseSurveyStatus;
    opensAt: Date;
    dueAt: Date;
    submittedAt?: Date | null;
  },
  now = new Date(),
): CourseSurveyAvailability {
  if (survey.submittedAt) return "SUBMITTED";
  if (survey.status !== "PUBLISHED") return "CLOSED";
  if (survey.dueAt <= now) return "EXPIRED";
  if (survey.opensAt > now) return "SCHEDULED";
  return "OPEN";
}

export function nextCourseSurveyChangeAt(
  surveys: ReadonlyArray<{
    status: CourseSurveyStatus;
    opensAt: Date;
    dueAt: Date;
    submittedAt?: Date | null;
  }>,
  now = new Date(),
): Date | null {
  return (
    surveys
      .filter((survey) => survey.status === "PUBLISHED" && !survey.submittedAt)
      .flatMap((survey) => [survey.opensAt, survey.dueAt])
      .filter((date) => date > now)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  );
}

export const COURSE_SURVEY_AVAILABILITY_LABELS = {
  SUBMITTED: "已提交",
  CLOSED: "已关闭",
  EXPIRED: "已截止",
  SCHEDULED: "待开放",
  OPEN: "待完成",
} as const;
