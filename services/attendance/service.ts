import { getStudentClassroomContext } from "@/services/courses/student-access";
import {
  AttendanceSignInMethod,
  AttendanceRecordSource,
  AttendanceSessionStatus,
  AttendanceStatus,
  AuditAction,
  AuditTargetType,
  MembershipStatus,
  Prisma,
} from "@prisma/client";
import { compare, hash } from "bcryptjs";

import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
import { AttendanceOperationError } from "@/services/attendance/errors";
import type { StudentAttendanceSignInInput } from "@/services/attendance/schemas";
import { getStudentCourseContext } from "@/services/courses/student-access";
import { notifyAttendancePublished } from "@/services/notifications/events/attendance";

const MAX_CHALLENGE_ATTEMPTS = 5;
const CHALLENGE_HASH_ROUNDS = 12;

export type AttendanceChallenge =
  | { method: typeof AttendanceSignInMethod.CODE; code: string }
  | { method: typeof AttendanceSignInMethod.GRAPHIC; pattern: number[] };

function challengeHash(
  sessionId: string,
  method:
    typeof AttendanceSignInMethod.CODE | typeof AttendanceSignInMethod.GRAPHIC,
  value: string,
) {
  return hash(`${sessionId}:${method}:${value}`, CHALLENGE_HASH_ROUNDS);
}

async function buildChallenge(
  sessionId: string,
  method: AttendanceSignInMethod,
  code?: string,
  pattern?: number[],
): Promise<{ challenge: AttendanceChallenge; hash: string } | null> {
  if (method === AttendanceSignInMethod.CODE && code) {
    const normalizedCode = code.toUpperCase();
    return {
      challenge: { method, code: normalizedCode },
      hash: await challengeHash(sessionId, method, normalizedCode),
    };
  }
  if (method === AttendanceSignInMethod.GRAPHIC && pattern) {
    return {
      challenge: { method, pattern },
      hash: await challengeHash(sessionId, method, pattern.join(",")),
    };
  }
  return null;
}

function matchesChallenge(
  sessionId: string,
  method:
    typeof AttendanceSignInMethod.CODE | typeof AttendanceSignInMethod.GRAPHIC,
  value: string,
  expectedHash: string | null,
) {
  if (!expectedHash) return Promise.resolve(false);
  return compare(`${sessionId}:${method}:${value}`, expectedHash);
}

function distanceInMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) *
      Math.cos(radians(second.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

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
      classroom: { select: { id: true, name: true, status: true } },
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
    signInMethod?: AttendanceSignInMethod;
    signInCode?: string;
    signInPattern?: number[];
    locationLatitude?: number;
    locationLongitude?: number;
    locationRadiusMeters?: number;
    startsAt: Date;
    signInOpensAt: Date;
    lateAfter: Date;
    signInClosesAt: Date;
  },
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      const signInMethod = input.signInMethod ?? AttendanceSignInMethod.DIRECT;
      if (
        signInMethod === AttendanceSignInMethod.LOCATION &&
        (input.locationLatitude === undefined ||
          input.locationLongitude === undefined ||
          input.locationRadiusMeters === undefined)
      )
        throw new AttendanceOperationError(
          "位置签到需要设置发布者位置和签到距离。",
          400,
        );
      if (
        signInMethod === AttendanceSignInMethod.CODE &&
        input.signInCode === undefined
      )
        throw new AttendanceOperationError(
          "签到码签到需要由发布者设置签到码。",
          400,
        );
      if (
        signInMethod === AttendanceSignInMethod.GRAPHIC &&
        input.signInPattern === undefined
      )
        throw new AttendanceOperationError(
          "图形签到需要由发布者设置九点阵图形。",
          400,
        );
      const course = await ownedCourse(teacherId, courseId, transaction);
      const classroom = await transaction.classroom.findFirst({
        where: { id: input.classroomId, courseId, teacherId, status: "ACTIVE" },
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
          signInMethod,
          ...(signInMethod === AttendanceSignInMethod.LOCATION
            ? {
                locationLatitude: input.locationLatitude,
                locationLongitude: input.locationLongitude,
                locationRadiusMeters: input.locationRadiusMeters,
              }
            : {}),
          startsAt: input.startsAt,
          signInOpensAt: input.signInOpensAt,
          lateAfter: input.lateAfter,
          signInClosesAt: input.signInClosesAt,
          records: {
            create: members.map((member) => ({ studentId: member.studentId })),
          },
        },
      });
      const initialChallenge = await buildChallenge(
        session.id,
        signInMethod,
        input.signInCode,
        input.signInPattern,
      );
      if (
        (signInMethod === AttendanceSignInMethod.CODE ||
          signInMethod === AttendanceSignInMethod.GRAPHIC) &&
        !initialChallenge
      )
        throw new AttendanceOperationError(
          "签到口令设置无效，请重新设置。",
          400,
        );
      if (initialChallenge)
        await transaction.attendanceSession.update({
          where: { id: session.id },
          data: { challengeHash: initialChallenge.hash },
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
          signInMethod,
          ...(signInMethod === AttendanceSignInMethod.LOCATION
            ? { locationRadiusMeters: input.locationRadiusMeters }
            : {}),
          signInOpensAt: input.signInOpensAt.toISOString(),
          lateAfter: input.lateAfter.toISOString(),
          signInClosesAt: input.signInClosesAt.toISOString(),
        },
        context,
      });
      await notifyAttendancePublished(
        {
          sessionId: session.id,
          courseId,
          classroomId: classroom.id,
          courseName: course.name,
          classroomName: classroom.name,
          title: session.title,
          opensAt: session.signInOpensAt,
          closesAt: session.signInClosesAt,
          recipientIds: members.map((member) => member.studentId),
        },
        transaction,
      );
      return { id: session.id, revision: session.revision };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateTeacherAttendanceSession(
  teacherId: string,
  sessionId: string,
  input: {
    action: "OPEN" | "CLOSE" | "CANCEL" | "ROTATE_CHALLENGE";
    expectedRevision: number;
    signInCode?: string;
    signInPattern?: number[];
  },
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
      if (
        input.action === "OPEN" &&
        session.status !== AttendanceSessionStatus.SCHEDULED
      )
        throw new AttendanceOperationError("当前签到场次不能重复开放。", 409);
      if (input.action === "OPEN" && session.classroom.status !== "ACTIVE")
        throw new AttendanceOperationError(
          "已结课或已关闭的班级不能开放签到。",
          409,
        );
      if (
        input.action === "ROTATE_CHALLENGE" &&
        (![
          AttendanceSessionStatus.SCHEDULED,
          AttendanceSessionStatus.OPEN,
        ].includes(session.status) ||
          (session.signInMethod !== AttendanceSignInMethod.CODE &&
            session.signInMethod !== AttendanceSignInMethod.GRAPHIC))
      )
        throw new AttendanceOperationError(
          "只有待开放或正在进行的签到码、图形签到可以更换口令。",
          409,
        );
      const replacementChallenge =
        input.action === "ROTATE_CHALLENGE"
          ? await buildChallenge(
              session.id,
              session.signInMethod,
              input.signInCode,
              input.signInPattern,
            )
          : null;
      if (input.action === "ROTATE_CHALLENGE" && !replacementChallenge)
        throw new AttendanceOperationError(
          session.signInMethod === AttendanceSignInMethod.CODE
            ? "请设置 4 至 12 位字母或数字签到码。"
            : "请绘制至少 4 个点的九点阵图形。",
        );
      const next =
        input.action === "OPEN"
          ? AttendanceSessionStatus.OPEN
          : input.action === "CLOSE"
            ? AttendanceSessionStatus.CLOSED
            : input.action === "CANCEL"
              ? AttendanceSessionStatus.CANCELLED
              : session.status;
      if (
        input.action === "OPEN" &&
        (now < session.signInOpensAt || now > session.signInClosesAt)
      )
        throw new AttendanceOperationError(
          "当前不在签到开放时间窗口内。",
          409,
          "ATTENDANCE_WINDOW_CLOSED",
        );
      if (
        input.action === "ROTATE_CHALLENGE" &&
        session.status === AttendanceSessionStatus.OPEN &&
        (now < session.signInOpensAt || now > session.signInClosesAt)
      )
        throw new AttendanceOperationError(
          "签到已不在有效时间内，不能更换口令。",
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
          ...(replacementChallenge
            ? { challengeHash: replacementChallenge.hash }
            : {}),
          ...(next === AttendanceSessionStatus.CLOSED ? { endedAt: now } : {}),
          ...(next === AttendanceSessionStatus.CANCELLED
            ? { cancelledAt: now }
            : {}),
        },
      });
      if (replacementChallenge)
        await transaction.attendanceRecord.updateMany({
          where: { sessionId },
          data: { challengeAttempts: 0, challengeLockedUntil: null },
        });
      if (input.action === "OPEN") {
        const recipients = await transaction.attendanceRecord.findMany({
          where: {
            sessionId,
            student: {
              classMemberships: {
                some: {
                  classroomId: session.classroomId,
                  status: MembershipStatus.ACTIVE,
                },
              },
            },
          },
          select: { studentId: true },
        });
        await notifyAttendancePublished(
          {
            sessionId,
            courseId: session.courseId,
            classroomId: session.classroomId,
            courseName: session.course.name,
            classroomName: session.classroom.name,
            title: session.title,
            opensAt: session.signInOpensAt,
            closesAt: session.signInClosesAt,
            recipientIds: recipients.map((record) => record.studentId),
          },
          transaction,
        );
      }
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.ATTENDANCE_SESSION_UPDATED,
        targetType: AuditTargetType.ATTENDANCE_SESSION,
        targetId: sessionId,
        summary:
          input.action === "ROTATE_CHALLENGE"
            ? "更换签到口令"
            : `更新签到场次状态：${next}`,
        beforeData: { status: session.status, revision: session.revision },
        afterData: {
          status: next,
          revision: updated.revision,
          signInMethod: session.signInMethod,
          challengeRotated: Boolean(replacementChallenge),
        },
        context,
      });
      const { challengeHash: _challengeHash, ...safeUpdated } = updated;
      return {
        ...safeUpdated,
        challenge: replacementChallenge?.challenge ?? null,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function signStudentAttendance(
  studentId: string,
  sessionId: string,
  input: StudentAttendanceSignInInput,
  context: AuditRequestContext,
  now = new Date(),
) {
  const outcome = await prisma.$transaction(async (transaction) => {
    const session = await transaction.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        classroom: {
          select: {
            status: true,
            memberships: {
              where: { studentId, status: "ACTIVE" },
              select: { id: true },
            },
          },
        },
        records: {
          where: { studentId },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!session || session.records.length === 0)
      throw new ResourceNotFoundError("签到场次不存在。");
    if (
      session.classroom.status !== "ACTIVE" ||
      !session.classroom.memberships.length
    )
      throw new ResourceNotFoundError("当前班级无法签到。");
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
    const recordId = session.records[0]!.id;
    await transaction.$queryRaw`SELECT "id" FROM "AttendanceRecord" WHERE "id" = ${recordId} FOR UPDATE`;
    const record = await transaction.attendanceRecord.findUniqueOrThrow({
      where: { id: recordId },
    });
    if (record.currentStatus !== AttendanceStatus.PENDING)
      return { kind: "signed" as const, record, reused: true };
    if (input.method !== session.signInMethod)
      throw new AttendanceOperationError(
        "签到方式与本场设置不一致，请刷新页面后重试。",
        400,
        "ATTENDANCE_METHOD_MISMATCH",
      );
    if (input.method === AttendanceSignInMethod.LOCATION) {
      if (
        session.locationLatitude === null ||
        session.locationLongitude === null ||
        session.locationRadiusMeters === null
      )
        throw new AttendanceOperationError(
          "本场位置签到设置无效，请联系教师。",
          409,
        );
      if (input.accuracyMeters > Math.min(100, session.locationRadiusMeters))
        throw new AttendanceOperationError(
          "定位精度不足以满足当前签到距离，请开启精确定位后重试。",
          400,
          "ATTENDANCE_LOCATION_INACCURATE",
        );
      const distance = distanceInMeters(
        {
          latitude: input.latitude,
          longitude: input.longitude,
        },
        {
          latitude: session.locationLatitude,
          longitude: session.locationLongitude,
        },
      );
      if (distance > session.locationRadiusMeters)
        throw new AttendanceOperationError(
          `当前位置超出签到距离（${session.locationRadiusMeters} 米）。`,
          403,
          "ATTENDANCE_LOCATION_OUT_OF_RANGE",
        );
    }
    if (
      input.method === AttendanceSignInMethod.CODE ||
      input.method === AttendanceSignInMethod.GRAPHIC
    ) {
      if (
        record.challengeAttempts >= MAX_CHALLENGE_ATTEMPTS ||
        (record.challengeLockedUntil && now < record.challengeLockedUntil)
      )
        return { kind: "locked" as const };
      const proof =
        input.method === AttendanceSignInMethod.CODE
          ? input.code.toUpperCase()
          : input.pattern.join(",");
      if (
        !(await matchesChallenge(
          session.id,
          input.method,
          proof,
          session.challengeHash,
        ))
      ) {
        const attempts = record.challengeAttempts + 1;
        await transaction.attendanceRecord.update({
          where: { id: record.id },
          data: {
            challengeAttempts: attempts,
            ...(attempts >= MAX_CHALLENGE_ATTEMPTS
              ? { challengeLockedUntil: session.signInClosesAt }
              : {}),
          },
        });
        return {
          kind:
            attempts >= MAX_CHALLENGE_ATTEMPTS
              ? ("locked" as const)
              : ("invalid" as const),
        };
      }
    }
    const status =
      now <= session.lateAfter
        ? AttendanceStatus.PRESENT
        : AttendanceStatus.LATE;
    const result = await appendRevision(transaction, {
      recordId,
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
        targetId: recordId,
        summary: `学生课堂签到（${session.signInMethod}）`,
        beforeData: { status: AttendanceStatus.PENDING },
        afterData: {
          status,
          signInMethod: session.signInMethod,
          signedAt: now.toISOString(),
        },
        context,
      });
    return {
      kind: "signed" as const,
      record: result.record,
      reused: result.reused,
    };
  });
  if (outcome.kind === "invalid")
    throw new AttendanceOperationError(
      "签到口令或图形不正确，请核对后重试。",
      400,
      "ATTENDANCE_CHALLENGE_INVALID",
    );
  if (outcome.kind === "locked")
    throw new AttendanceOperationError(
      "错误次数过多，本次签到已锁定，请联系教师处理。",
      429,
      "ATTENDANCE_CHALLENGE_LOCKED",
    );
  return { record: outcome.record, reused: outcome.reused };
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
  classroomId?: string,
) {
  await ownedCourse(teacherId, courseId);
  if (
    classroomId &&
    !(await prisma.classroom.findFirst({
      where: { id: classroomId, courseId, teacherId },
      select: { id: true },
    }))
  )
    throw new ResourceNotFoundError("班级不存在。");
  const sessions = await prisma.attendanceSession.findMany({
    where: { courseId, teacherId, ...(classroomId ? { classroomId } : {}) },
    orderBy: { startsAt: "desc" },
    include: {
      classroom: { select: { id: true, name: true, status: true } },
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
    sessions: sessions.map(
      ({
        challengeHash: _challengeHash,
        locationLatitude: _locationLatitude,
        locationLongitude: _locationLongitude,
        ...session
      }) => session,
    ),
    summaries: [...byStudent.values()].map((student) => ({
      ...student,
      ...calculateAttendanceRate(student.statuses),
    })),
  };
}

const studentAttendanceRecordInclude =
  Prisma.validator<Prisma.AttendanceRecordInclude>()({
    session: {
      select: {
        id: true,
        title: true,
        status: true,
        signInMethod: true,
        locationRadiusMeters: true,
        startsAt: true,
        signInOpensAt: true,
        signInClosesAt: true,
        lateAfter: true,
        course: { select: { id: true, name: true, courseNo: true } },
        classroom: { select: { id: true, name: true, status: true } },
      },
    },
    revisions: { orderBy: { revisionNumber: "desc" } },
  });

export async function getStudentAttendanceSession(
  studentId: string,
  sessionId: string,
) {
  const record = await prisma.attendanceRecord.findFirst({
    where: {
      studentId,
      sessionId,
      session: {
        classroom: {
          memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
        },
      },
    },
    include: studentAttendanceRecordInclude,
  });
  if (!record) throw new ResourceNotFoundError("签到场次不存在。");
  await getStudentClassroomContext(
    studentId,
    record.session.classroom.id,
    record.session.course.id,
  );
  return record;
}

export async function getStudentAttendance(
  studentId: string,
  courseId?: string,
  classroomId?: string,
) {
  if (classroomId)
    await getStudentClassroomContext(studentId, classroomId, courseId);
  const course = courseId
    ? await getStudentCourseContext(studentId, courseId)
    : null;
  const records = await prisma.attendanceRecord.findMany({
    where: {
      studentId,
      session: {
        ...(classroomId ? { classroomId } : {}),
        ...(courseId ? { courseId } : {}),
        classroom: {
          memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
        },
      },
    },
    orderBy: { session: { startsAt: "desc" } },
    include: studentAttendanceRecordInclude,
  });
  const closed = records.filter(
    (record) => record.session.status === AttendanceSessionStatus.CLOSED,
  );
  return {
    ...(course ? { course } : {}),
    records: records.map(({ session, ...record }) => ({
      ...record,
      session,
    })),
    summary: calculateAttendanceRate(
      closed.map((record) => record.currentStatus),
    ),
  };
}
