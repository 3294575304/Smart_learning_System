import "server-only";
import { AuditAction, AuditTargetType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { StudentImportOperationError } from "@/services/student-imports/errors";
import { rosterMutationSchema, rosterQuerySchema } from "./schemas";

async function courseScope(
  db: Prisma.TransactionClient,
  teacherId: string,
  courseId: string,
) {
  const course = await db.course.findFirst({
    where: {
      id: courseId,
      teacherId,
      status: { not: "ARCHIVED" },
      teacher: { role: "TEACHER", status: "ACTIVE" },
    },
    select: {
      id: true,
      name: true,
      classrooms: {
        where: { teacherId, status: "ACTIVE" },
        select: { id: true, name: true },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  return course;
}

export async function listCourseRoster(
  teacherId: string,
  courseId: string,
  raw: unknown,
) {
  const input = rosterQuerySchema.parse(raw);
  const course = await courseScope(prisma, teacherId, courseId);
  if (
    input.classroomId &&
    !course.classrooms.some((c) => c.id === input.classroomId)
  )
    throw new ResourceNotFoundError("课程或班级不存在");
  const classroomIds = input.classroomId
    ? [input.classroomId]
    : course.classrooms.map((c) => c.id);
  const [members, pending] = await Promise.all([
    prisma.classMembership.findMany({
      where: { classroomId: { in: classroomIds } },
      include: {
        classroom: { select: { name: true } },
        student: {
          select: {
            id: true,
            profile: {
              select: { displayName: true, studentNo: true, updatedAt: true },
            },
            classMemberships: {
              where: { status: "ACTIVE" },
              select: { classroom: { select: { teacherId: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.studentIdentityClassroomAssignment.findMany({
      where: {
        classroomId: { in: classroomIds },
        studentIdentity: { status: "PENDING", userId: null },
      },
      include: {
        classroom: { select: { name: true } },
        studentIdentity: {
          select: {
            id: true,
            name: true,
            studentNo: true,
            updatedAt: true,
            assignments: {
              where: { withdrawnAt: null },
              select: {
                classroom: { select: { teacherId: true, status: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const rows = [
    ...members.map((m) => ({
      id: m.id,
      kind: "MEMBER" as const,
      classroomId: m.classroomId,
      classroomName: m.classroom.name,
      name: m.student.profile?.displayName ?? "未设置姓名",
      studentNo: m.student.profile?.studentNo ?? "",
      status: m.status === "ACTIVE" ? "ACTIVE" : "REMOVED",
      updatedAt: m.updatedAt.toISOString(),
      identityUpdatedAt:
        m.student.profile?.updatedAt.toISOString() ?? m.updatedAt.toISOString(),
      canEdit:
        m.status === "ACTIVE" &&
        Boolean(m.student.profile) &&
        m.student.classMemberships.every(
          (x) => x.classroom.teacherId === teacherId,
        ),
    })),
    ...pending.map((a) => ({
      id: a.id,
      kind: "PENDING" as const,
      classroomId: a.classroomId,
      classroomName: a.classroom.name,
      name: a.studentIdentity.name,
      studentNo: a.studentIdentity.studentNo,
      status: a.withdrawnAt ? "REMOVED" : "PENDING",
      updatedAt: a.updatedAt.toISOString(),
      identityUpdatedAt: a.studentIdentity.updatedAt.toISOString(),
      canEdit:
        !a.withdrawnAt &&
        a.studentIdentity.assignments.every(
          (x) => x.classroom.teacherId === teacherId,
        ),
    })),
  ];
  const counts = {
    active: rows.filter((r) => r.status === "ACTIVE").length,
    pending: rows.filter((r) => r.status === "PENDING").length,
    removed: rows.filter((r) => r.status === "REMOVED").length,
  };
  const filtered = rows.filter(
    (r) =>
      (input.status === "ALL" ||
        (input.status === "ACTIVE"
          ? r.status !== "REMOVED"
          : r.status === input.status)) &&
      (!input.keyword ||
        (r.name + " " + r.studentNo)
          .toLowerCase()
          .includes(input.keyword.toLowerCase())),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 20)),
    page = Math.min(input.page, pages);
  return {
    course: { id: course.id, name: course.name },
    classrooms: course.classrooms,
    counts,
    total: filtered.length,
    page,
    pages,
    items: filtered.slice((page - 1) * 20, page * 20),
  };
}

export async function mutateCourseRoster(
  teacherId: string,
  courseId: string,
  raw: unknown,
) {
  const input = rosterMutationSchema.parse(raw);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(
        async (db) => {
          const course = await courseScope(db, teacherId, courseId),
            ids = course.classrooms.map((c) => c.id);
          let before: Prisma.InputJsonObject | null = null;
          let targetId = courseId;
          if (input.action === "ADD") {
            if (!ids.includes(input.classroomId))
              throw new ResourceNotFoundError("课程或班级不存在");
            const [profile, identity] = await Promise.all([
              db.userProfile.findUnique({
                where: { studentNo: input.studentNo },
                include: {
                  user: { select: { id: true, role: true, status: true } },
                },
              }),
              db.studentIdentity.findUnique({
                where: { studentNo: input.studentNo },
                include: {
                  user: {
                    select: {
                      id: true,
                      role: true,
                      status: true,
                      profile: { select: { displayName: true } },
                    },
                  },
                },
              }),
            ]);
            const user = profile?.user ?? identity?.user;
            const knownName =
              profile?.displayName ??
              identity?.user?.profile?.displayName ??
              identity?.name;
            if (knownName && knownName !== input.name)
              throw new StudentImportOperationError(
                "学号与姓名不匹配，请核对后添加",
                409,
              );
            if (user) {
              if (user.role !== Role.STUDENT || user.status !== "ACTIVE")
                throw new StudentImportOperationError(
                  "该身份不能作为在读学生添加",
                  409,
                );
              const member = await db.classMembership.upsert({
                where: {
                  classroomId_studentId: {
                    classroomId: input.classroomId,
                    studentId: user.id,
                  },
                },
                create: { classroomId: input.classroomId, studentId: user.id },
                update: { status: "ACTIVE", endedAt: null },
              });
              targetId = member.id;
            } else {
              if (identity && identity.status !== "PENDING")
                throw new StudentImportOperationError(
                  "该身份暂不可加入，请联系管理员",
                  409,
                );
              const pending =
                identity ??
                (await db.studentIdentity.create({
                  data: { studentNo: input.studentNo, name: input.name },
                }));
              const assignment =
                await db.studentIdentityClassroomAssignment.upsert({
                  where: {
                    studentIdentityId_classroomId: {
                      studentIdentityId: pending.id,
                      classroomId: input.classroomId,
                    },
                  },
                  create: {
                    studentIdentityId: pending.id,
                    classroomId: input.classroomId,
                  },
                  update: { withdrawnAt: null },
                });
              targetId = assignment.id;
            }
          } else if (input.action === "EDIT_MEMBER") {
            const member = await db.classMembership.findFirst({
              where: {
                id: input.membershipId,
                classroomId: { in: ids },
                status: "ACTIVE",
              },
              include: {
                student: {
                  include: {
                    profile: true,
                    classMemberships: {
                      where: { status: "ACTIVE" },
                      include: { classroom: { select: { teacherId: true } } },
                    },
                  },
                },
              },
            });
            if (!member?.student.profile)
              throw new ResourceNotFoundError("名单记录不存在");
            if (
              member.student.classMemberships.some(
                (m) => m.classroom.teacherId !== teacherId,
              )
            )
              throw new StudentImportOperationError(
                "该学生由多个教师共用，请联系管理员纠正姓名",
                409,
              );
            const profile = member.student.profile;
            if (profile.updatedAt.toISOString() !== input.expectedUpdatedAt)
              throw new StudentImportOperationError(
                "学生信息已更新，请刷新后重新编辑",
                409,
              );
            before = {
              name: profile.displayName,
              studentNo: profile.studentNo ?? "",
            };
            targetId = profile.id;
            await db.userProfile.update({
              where: { id: profile.id },
              data: { displayName: input.name },
            });
          } else if (input.action === "EDIT") {
            const a = await db.studentIdentityClassroomAssignment.findFirst({
              where: {
                id: input.assignmentId,
                classroomId: { in: ids },
                withdrawnAt: null,
              },
              include: {
                studentIdentity: {
                  include: {
                    assignments: {
                      where: { withdrawnAt: null },
                      include: { classroom: { select: { teacherId: true } } },
                    },
                  },
                },
              },
            });
            if (!a) throw new ResourceNotFoundError("名单记录不存在");
            await db.$queryRaw`SELECT "id" FROM "StudentIdentity" WHERE "id" = ${a.studentIdentityId} FOR UPDATE`;
            const identity = a.studentIdentity;
            if (identity.status !== "PENDING" || identity.userId)
              throw new StudentImportOperationError(
                "学生已认领，请刷新名单；已认领身份信息由管理员维护",
                409,
              );
            if (
              identity.assignments.some(
                (x) => x.classroom.teacherId !== teacherId,
              )
            )
              throw new StudentImportOperationError(
                "该身份由多个教师共用，请联系管理员纠正",
                409,
              );
            if (identity.updatedAt.toISOString() !== input.expectedUpdatedAt)
              throw new StudentImportOperationError(
                "名单已更新，请刷新后重新编辑",
                409,
              );
            if (
              input.studentNo !== identity.studentNo &&
              (await db.userProfile.findUnique({
                where: { studentNo: input.studentNo },
                select: { id: true },
              }))
            )
              throw new StudentImportOperationError("该学号已被使用", 409);
            before = { studentNo: identity.studentNo, name: identity.name };
            targetId = identity.id;
            await db.studentIdentity.update({
              where: { id: identity.id },
              data: { studentNo: input.studentNo, name: input.name },
            });
          } else if (input.kind === "MEMBER") {
            const m = await db.classMembership.findFirst({
              where: { id: input.id, classroomId: { in: ids } },
              include: { student: { select: { role: true, status: true } } },
            });
            if (!m) throw new ResourceNotFoundError("名单记录不存在");
            const desired = input.action === "RESTORE" ? "ACTIVE" : "REMOVED";
            if (m.status === desired) return { id: m.id };
            if (m.updatedAt.toISOString() !== input.expectedUpdatedAt)
              throw new StudentImportOperationError(
                "名单已更新，请刷新后重试",
                409,
              );
            if (
              desired === "ACTIVE" &&
              (m.student.role !== "STUDENT" || m.student.status !== "ACTIVE")
            )
              throw new StudentImportOperationError(
                "该账号暂不可恢复，请联系管理员",
                409,
              );
            before = { status: m.status };
            targetId = m.id;
            await db.classMembership.update({
              where: { id: m.id },
              data: {
                status: desired,
                endedAt: desired === "ACTIVE" ? null : new Date(),
              },
            });
            const identity = await db.studentIdentity.findUnique({
              where: { userId: m.studentId },
              select: { id: true },
            });
            if (identity)
              await db.studentIdentityClassroomAssignment.updateMany({
                where: {
                  studentIdentityId: identity.id,
                  classroomId: m.classroomId,
                },
                data: { withdrawnAt: desired === "ACTIVE" ? null : new Date() },
              });
          } else {
            const a = await db.studentIdentityClassroomAssignment.findFirst({
              where: { id: input.id, classroomId: { in: ids } },
              include: {
                studentIdentity: { select: { status: true, userId: true } },
              },
            });
            if (!a) throw new ResourceNotFoundError("名单记录不存在");
            await db.$queryRaw`SELECT "id" FROM "StudentIdentity" WHERE "id" = ${a.studentIdentityId} FOR UPDATE`;
            if (
              a.studentIdentity.status !== "PENDING" ||
              a.studentIdentity.userId
            )
              throw new StudentImportOperationError(
                "学生已认领，请刷新后在在读名单操作",
                409,
              );
            const removing = input.action === "REMOVE";
            if (Boolean(a.withdrawnAt) === removing) return { id: a.id };
            if (a.updatedAt.toISOString() !== input.expectedUpdatedAt)
              throw new StudentImportOperationError(
                "名单已更新，请刷新后重试",
                409,
              );
            before = { withdrawn: Boolean(a.withdrawnAt) };
            targetId = a.id;
            await db.studentIdentityClassroomAssignment.update({
              where: { id: a.id },
              data: { withdrawnAt: removing ? new Date() : null },
            });
          }
          await db.auditLog.create({
            data: {
              actorId: teacherId,
              action: AuditAction.COURSE_ROSTER_UPDATED,
              targetType: AuditTargetType.COURSE,
              targetId: courseId,
              summary: "教师维护课程学生名单",
              ...(before ? { beforeData: before } : {}),
              afterData: {
                operation: input.action,
                recordId: targetId,
                ...(input.action === "ADD" || input.action === "EDIT"
                  ? { studentNo: input.studentNo, name: input.name }
                  : input.action === "EDIT_MEMBER"
                    ? { name: input.name }
                    : {}),
              },
            },
          });
          return { id: targetId };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      )
        continue;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code)
      )
        throw new StudentImportOperationError(
          "学号重复或名单已发生变化，请刷新后重试",
          409,
        );
      throw error;
    }
  }
  throw new StudentImportOperationError("名单更新冲突，请重试", 409);
}
