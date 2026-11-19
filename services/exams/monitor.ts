import "server-only";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { examAttendanceState } from "./monitor-state";
import { countedExamSwitchKinds } from "./switch-policy";

export async function getExamMonitor(
  teacherId: string,
  examId: string,
  classroomId: string,
) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      teacherId,
      examSessionId: examId,
      classroomId,
      deletedAt: null,
      examSession: { teacherId },
      classroom: { teacherId },
    },
    select: {
      id: true,
      status: true,
      examSession: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          cancelledAt: true,
          allowedSwitches: true,
        },
      },
      classroom: {
        select: {
          name: true,
          status: true,
          memberships: {
            where: { status: "ACTIVE" },
            orderBy: { studentId: "asc" },
            select: {
              studentId: true,
              student: {
                select: {
                  profile: { select: { displayName: true, studentNo: true } },
                },
              },
            },
          },
        },
      },
      submissions: {
        where: { status: { not: "WITHDRAWN" } },
        orderBy: [{ attemptNumber: "desc" }, { id: "desc" }],
        distinct: ["studentId"],
        select: {
          id: true,
          studentId: true,
          status: true,
          examSubmissionReason: true,
          lastSavedAt: true,
          submittedAt: true,
          _count: {
            select: {
              examSwitchEvents: {
                where: { kind: { in: [...countedExamSwitchKinds] } },
              },
            },
          },
          examSwitchEvents: {
            where: { kind: { in: [...countedExamSwitchKinds] } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });
  const exam = assignment?.examSession;
  if (!assignment || !exam) throw new ResourceNotFoundError("考试教学班不存在");
  const observations = assignment.submissions.length
    ? await prisma.examSwitchEvent.groupBy({
        by: ["submissionId", "kind"],
        where: {
          examSessionId: exam.id,
          submissionId: { in: assignment.submissions.map(({ id }) => id) },
          kind: { not: "VISIBILITY" },
        },
        _count: { _all: true },
      })
    : [];
  const observationCounts = new Map(
    observations.map(({ submissionId, kind, _count }) => [
      `${submissionId}:${kind}`,
      _count._all,
    ]),
  );
  const now = new Date();
  const attempts = new Map(
    assignment.submissions.map((submission) => [
      submission.studentId,
      submission,
    ]),
  );
  const started = now >= exam.startsAt;
  const ended = now >= exam.endsAt;
  const classroomActive =
    assignment.classroom.status === "ACTIVE" &&
    assignment.status === "PUBLISHED";
  return {
    assignmentId: assignment.id,
    title: exam.title,
    classroomName: assignment.classroom.name,
    canConfigurePublication:
      !exam.cancelledAt && ["PUBLISHED", "CLOSED"].includes(assignment.status),
    startsAt: exam.startsAt.toISOString(),
    endsAt: exam.endsAt.toISOString(),
    checkedAt: now.toISOString(),
    live:
      !exam.cancelledAt &&
      ((!ended && classroomActive) ||
        assignment.classroom.memberships.some(
          ({ studentId }) => attempts.get(studentId)?.status === "IN_PROGRESS",
        )),
    allowedSwitches: exam.allowedSwitches,
    rows: assignment.classroom.memberships.map((member) => {
      const attempt = attempts.get(member.studentId);
      const reason = attempt?.examSubmissionReason ?? null;
      return {
        id: member.studentId,
        name: member.student.profile?.displayName || "未设置姓名",
        studentNo: member.student.profile?.studentNo ?? null,
        state: examAttendanceState({
          cancelled: Boolean(exam.cancelledAt),
          started,
          ended,
          classroomActive,
          submission: attempt ? { status: attempt.status, reason } : undefined,
        }),
        switches: attempt?._count.examSwitchEvents ?? 0,
        fullscreenExits:
          observationCounts.get(`${attempt?.id}:FULLSCREEN_EXIT`) ?? 0,
        windowBlurs: observationCounts.get(`${attempt?.id}:WINDOW_BLUR`) ?? 0,
        windowSwitches:
          observationCounts.get(`${attempt?.id}:WINDOW_SWITCH`) ?? 0,
        lastSwitchAt:
          attempt?.examSwitchEvents[0]?.createdAt.toISOString() ?? null,
        lastSavedAt: attempt?.lastSavedAt?.toISOString() ?? null,
        submittedAt: attempt?.submittedAt?.toISOString() ?? null,
        reason,
        submissionId:
          attempt && attempt.status !== "IN_PROGRESS" ? attempt.id : null,
      };
    }),
  };
}
