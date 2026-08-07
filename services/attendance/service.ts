import {
  AttendanceRecordSource,
  AttendanceSessionStatus,
  AttendanceStatus,
  AuditAction,
  AuditTargetType,
  MembershipStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
import { AttendanceOperationError } from "@/services/attendance/errors";

async function ownedCourse(
  teacherId: string,
  courseId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const course = await client.course.findFirst({
    where: { id: courseId, teacherId },
    select: { id: true, name: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}
async function ownedSession(
  teacherId: string,
  sessionId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const session = await client.attendanceSession.findFirst({
    where: {
      id: sessionId,
      teacherId,
      course: { teacherId },
      classroom: { teacherId },
    },
    include: {
      course: { select: { id: true, name: true } },
      classroom: { select: { id: true, name: true } },
    },
  });
  if (!session) throw new ResourceNotFoundError("签到场次不存在。");
  return session;
}
async function appendRevision(
  transaction: Prisma.TransactionClient,
  input: {
    recordId: string;
    status: AttendanceStatus;
    source: AttendanceRecordSource;
    actorId: string;
    reason?: string | null;
    signedAt?: Date | null;
    expectedRevisionNumber?: number;
  },
) {
  await transaction.$queryRaw`SELECT "id" FROM "AttendanceRecord" WHERE "id" = ${input.recordId} FOR UPDATE`;
  const record = await transaction.attendanceRecord.findUniqueOrThrow({
    where: { id: input.recordId },
  });
  if (
    input.expectedRevisionNumber !== undefined &&
    record.currentRevisionNumber !== input.expectedRevisionNumber
  )
    throw new AttendanceOperationError(
      "出勤记录已被更新，请刷新后重试。",
      409,
      "ATTENDANCE_REVISION_CONFLICT",
    );
  if (
    record.currentStatus === input.status &&
    input.source === AttendanceRecordSource.STUDENT_SIGN_IN
  )
    return { record, reused: true };
  const revisionNumber = record.currentRevisionNumber + 1;
  const revision = await transaction.attendanceRecordRevision.create({
    data: {
      recordId: record.id,
      revisionNumber,
      previousStatus: record.currentStatus,
      newStatus: input.status,
      source: input.source,
      actorId: input.actorId,
      reason: input.reason ?? null,
    },
  });
  const updated = await transaction.attendanceRecord.update({
    where: { id: record.id },
    data: {
      currentStatus: input.status,
      currentRevisionNumber: revisionNumber,
      ...(input.signedAt ? { signedAt: input.signedAt } : {}),
    },
  });
  return { record: updated, revision, reused: false };
}

export async function createTeacherAttendanceSession(
  teacherId: string,
  courseId: string,
  input: {
    classroomId: string;
    title: string;
    startsAt: Date;
    signInOpensAt: Date;
    lateAfter: Date;
    signInClosesAt: Date;
  },
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      await ownedCourse(teacherId, courseId, transaction);
      const classroom = await transaction.classroom.findFirst({
        where: { id: input.classroomId, courseId, teacherId },
        select: { id: true, name: true },
      });
      if (!classroom) throw new ResourceNotFoundError("班级不存在。");
      const members = await transaction.classMembership.findMany({
        where: {
          classroomId: input.classroomId,
          status: MembershipStatus.ACTIVE,
        },
        select: { studentId: true },
      });
      const session = await transaction.attendanceSession.create({
        data: {
          courseId,
          classroomId: input.classroomId,
          teacherId,
          title: input.title,
          startsAt: input.startsAt,
          signInOpensAt: input.signInOpensAt,
          lateAfter: input.lateAfter,
          signInClosesAt: input.signInClosesAt,
          records: {
            create: members.map((member) => ({ studentId: member.studentId })),
          },
        },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ATTENDANCE_SESSION_CREATED,
        targetType: AuditTargetType.ATTENDANCE_SESSION,
        targetId: session.id,
        summary: `创建签到场次：${input.title}`,
        beforeData: null,
        afterData: {
          courseId,
          classroomId: input.classroomId,
          memberCount: members.length,
          signInOpensAt: input.signInOpensAt.toISOString(),
          lateAfter: input.lateAfter.toISOString(),
          signInClosesAt: input.signInClosesAt.toISOString(),
        },
        context,
      });
      return session;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateTeacherAttendanceSession(
  teacherId: string,
  sessionId: string,
  input: { action: "OPEN" | "CLOSE" | "CANCEL"; expectedRevision: number },
  context: AuditRequestContext,
  now = new Date(),
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "AttendanceSession" WHERE "id" = ${sessionId} FOR UPDATE`;
      const session = await ownedSession(teacherId, sessionId, transaction);
      if (session.revision !== input.expectedRevision)
        throw new AttendanceOperationError(
          "签到场次已被更新，请刷新后重试。",
          409,
          "ATTENDANCE_SESSION_REVISION_CONFLICT",
        );
      if (
        session.status === AttendanceSessionStatus.CANCELLED ||
        session.status === AttendanceSessionStatus.CLOSED
      )
        throw new AttendanceOperationError(
          "已结束或取消的签到场次不能再次修改。",
          409,
        );
      const next =
        input.action === "OPEN"
          ? AttendanceSessionStatus.OPEN
          : input.action === "CLOSE"
            ? AttendanceSessionStatus.CLOSED
            : AttendanceSessionStatus.CANCELLED;
      if (
        input.action === "OPEN" &&
        (now < session.signInOpensAt || now > session.signInClosesAt)
      )
        throw new AttendanceOperationError(
          "当前不在签到开放时间窗口内。",
          409,
          "ATTENDANCE_WINDOW_CLOSED",
        );
      if (input.action === "CLOSE") {
        const pending = await transaction.attendanceRecord.findMany({
          where: { sessionId, currentStatus: AttendanceStatus.PENDING },
          select: { id: true },
        });
        for (const record of pending)
          await appendRevision(transaction, {
            recordId: record.id,
            status: AttendanceStatus.ABSENT,
            source: AttendanceRecordSource.SYSTEM,
            actorId: teacherId,
            reason: "签到场次结束时自动标记缺勤",
          });
      }
      const updated = await transaction.attendanceSession.update({
        where: { id: sessionId },
        data: {
          status: next,
          revision: { increment: 1 },
          ...(next === AttendanceSessionStatus.CLOSED ? { endedAt: now } : {}),
          ...(next === AttendanceSessionStatus.CANCELLED
            ? { cancelledAt: now }
            : {}),
        },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ATTENDANCE_SESSION_UPDATED,
        targetType: AuditTargetType.ATTENDANCE_SESSION,
        targetId: sessionId,
        summary: `更新签到场次状态：${next}`,
        beforeData: { status: session.status, revision: session.revision },
        afterData: { status: next, revision: updated.revision },
        context,
      });
      return updated;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function signStudentAttendance(
  studentId: string,
  sessionId: string,
  context: AuditRequestContext,
  now = new Date(),
) {
  return prisma.$transaction(async (transaction) => {
    const session = await transaction.attendanceSession.findUnique({
      where: { id: sessionId },
      include: { records: { where: { studentId }, take: 1 } },
    });
    if (!session || session.records.length === 0)
      throw new ResourceNotFoundError("签到场次不存在。");
    if (
      session.status !== AttendanceSessionStatus.OPEN ||
      now < session.signInOpensAt ||
      now > session.signInClosesAt
    )
      throw new AttendanceOperationError(
        "当前签到未开放或已截止。",
        409,
        "ATTENDANCE_WINDOW_CLOSED",
      );
    const status =
      now <= session.lateAfter
        ? AttendanceStatus.PRESENT
        : AttendanceStatus.LATE;
    const result = await appendRevision(transaction, {
      recordId: session.records[0]!.id,
      status,
      source: AttendanceRecordSource.STUDENT_SIGN_IN,
      actorId: studentId,
      signedAt: now,
    });
    if (!result.reused)
      await writeGovernanceAuditLog(transaction, {
        actorId: studentId,
        action: AuditAction.ATTENDANCE_SIGNED,
        targetType: AuditTargetType.ATTENDANCE_RECORD,
        targetId: session.records[0]!.id,
        summary: "学生课堂签到",
        beforeData: { status: AttendanceStatus.PENDING },
        afterData: { status, signedAt: now.toISOString() },
        context,
      });
    return result;
  });
}

export async function correctTeacherAttendanceRecord(
  teacherId: string,
  sessionId: string,
  recordId: string,
  input: {
    status: AttendanceStatus;
    reason: string;
    expectedRevisionNumber: number;
  },
  context: AuditRequestContext,
) {
  return prisma.$transaction(async (transaction) => {
    await ownedSession(teacherId, sessionId, transaction);
    const record = await transaction.attendanceRecord.findFirst({
      where: { id: recordId, sessionId },
    });
    if (!record) throw new ResourceNotFoundError("出勤记录不存在。");
    const result = await appendRevision(transaction, {
      recordId,
      status: input.status,
      source: AttendanceRecordSource.TEACHER_CORRECTION,
      actorId: teacherId,
      reason: input.reason,
      expectedRevisionNumber: input.expectedRevisionNumber,
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.ATTENDANCE_CORRECTED,
      targetType: AuditTargetType.ATTENDANCE_RECORD,
      targetId: recordId,
      summary: "教师纠正学生出勤状态",
      beforeData: {
        status: record.currentStatus,
        revisionNumber: record.currentRevisionNumber,
      },
      afterData: {
        status: input.status,
        revisionNumber: result.record.currentRevisionNumber,
        reason: input.reason,
      },
      context,
    });
    return result;
  });
}

export async function getTeacherCourseAttendance(
  teacherId: string,
  courseId: string,
) {
  await ownedCourse(teacherId, courseId);
  const sessions = await prisma.attendanceSession.findMany({
    where: { courseId, teacherId },
    orderBy: { startsAt: "desc" },
    include: {
      classroom: { select: { id: true, name: true } },
      records: {
        include: {
          student: {
            select: {
              profile: { select: { studentNo: true, displayName: true } },
            },
          },
          revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
        },
      },
    },
  });
  const byStudent = new Map<
    string,
    {
      studentId: string;
      studentNo: string | null;
      displayName: string;
      statuses: AttendanceStatus[];
    }
  >();
  for (const session of sessions.filter(
    (item) => item.status === AttendanceSessionStatus.CLOSED,
  ))
    for (const record of session.records) {
      const current = byStudent.get(record.studentId) ?? {
        studentId: record.studentId,
        studentNo: record.student.profile?.studentNo ?? null,
        displayName: record.student.profile?.displayName ?? "未命名学生",
        statuses: [],
      };
      current.statuses.push(record.currentStatus);
      byStudent.set(record.studentId, current);
    }
  return {
    sessions,
    summaries: [...byStudent.values()].map((student) => ({
      ...student,
      ...calculateAttendanceRate(student.statuses),
    })),
  };
}

export async function getStudentAttendance(studentId: string) {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      session: {
        classroom: {
          memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
        },
      },
    },
    orderBy: { session: { startsAt: "desc" } },
    include: {
      session: {
        include: {
          course: { select: { id: true, name: true, courseNo: true } },
          classroom: { select: { id: true, name: true } },
        },
      },
      revisions: { orderBy: { revisionNumber: "desc" } },
    },
  });
  const closed = records.filter(
    (record) => record.session.status === AttendanceSessionStatus.CLOSED,
  );
  return {
    records,
    summary: calculateAttendanceRate(
      closed.map((record) => record.currentStatus),
    ),
  };
}
