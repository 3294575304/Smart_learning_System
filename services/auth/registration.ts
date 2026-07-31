import {
  MembershipStatus,
  Prisma,
  Role,
  StudentIdentityStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { hashPasswordCore } from "@/services/auth/password-core";
import type { RegisterData } from "@/services/auth/schemas";
import {
  MaintenanceModeError,
  SelfRegistrationDisabledError,
} from "@/services/system-config/errors";
import { assertRegistrationAvailable } from "@/services/system-config/policy";
import { normalizeStudentName } from "@/services/student-identities/normalization";

export class StudentClaimError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "StudentClaimError";
  }
}

const INVALID_IDENTITY_MESSAGE = "学号或姓名信息不正确";
const BOUND_IDENTITY_MESSAGE = "该学生信息已绑定账号，请直接登录或联系教师";

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export async function claimStudentAccount(
  input: RegisterData,
  dependencies: {
    beforeCommit?: (transaction: Prisma.TransactionClient) => Promise<void>;
  } = {},
): Promise<{ id: string; role: Role }> {
  const passwordHash = await hashPasswordCore(input.password);

  try {
    return await prisma.$transaction(async (transaction) => {
      const config = await transaction.systemConfig.findUnique({
        where: { singletonKey: "default" },
        select: {
          maintenanceMode: true,
          maintenanceMessage: true,
          allowSelfRegistration: true,
        },
      });
      assertRegistrationAvailable(
        config ?? {
          maintenanceMode: false,
          maintenanceMessage: "系统维护中，请稍后再试。",
          allowSelfRegistration: true,
        },
      );

      const identity = await transaction.studentIdentity.findUnique({
        where: { studentNo: input.studentNo },
        include: { assignments: { select: { classroomId: true } } },
      });

      if (
        !identity ||
        identity.status === StudentIdentityStatus.DISABLED ||
        normalizeStudentName(identity.name) !==
          normalizeStudentName(input.displayName)
      ) {
        throw new StudentClaimError(INVALID_IDENTITY_MESSAGE, 400, {
          studentNo: [INVALID_IDENTITY_MESSAGE],
          displayName: [INVALID_IDENTITY_MESSAGE],
        });
      }

      if (
        identity.status === StudentIdentityStatus.ACTIVATED ||
        identity.userId
      ) {
        throw new StudentClaimError(BOUND_IDENTITY_MESSAGE, 409, {
          studentNo: [BOUND_IDENTITY_MESSAGE],
        });
      }

      const emailOwner = await transaction.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (emailOwner) {
        throw new StudentClaimError("该邮箱已被注册", 409, {
          email: ["该邮箱已被注册"],
        });
      }

      const user = await transaction.user.create({
        data: {
          email: input.email,
          passwordHash,
          role: Role.STUDENT,
          profile: {
            create: {
              displayName: normalizeStudentName(input.displayName),
              studentNo: input.studentNo,
            },
          },
        },
        select: { id: true, role: true },
      });

      const claimed = await transaction.studentIdentity.updateMany({
        where: {
          id: identity.id,
          status: StudentIdentityStatus.PENDING,
          userId: null,
        },
        data: {
          status: StudentIdentityStatus.ACTIVATED,
          userId: user.id,
          email: input.email,
        },
      });
      if (claimed.count !== 1) {
        throw new StudentClaimError(BOUND_IDENTITY_MESSAGE, 409, {
          studentNo: [BOUND_IDENTITY_MESSAGE],
        });
      }

      for (const assignment of identity.assignments) {
        await transaction.classMembership.upsert({
          where: {
            classroomId_studentId: {
              classroomId: assignment.classroomId,
              studentId: user.id,
            },
          },
          create: {
            classroomId: assignment.classroomId,
            studentId: user.id,
          },
          update: {
            status: MembershipStatus.ACTIVE,
            joinedAt: new Date(),
            endedAt: null,
          },
        });
      }

      await dependencies.beforeCommit?.(transaction);
      return user;
    });
  } catch (error: unknown) {
    if (
      error instanceof StudentClaimError ||
      error instanceof SelfRegistrationDisabledError ||
      error instanceof MaintenanceModeError
    ) {
      throw error;
    }
    if (isUniqueConflict(error)) {
      const identity = await prisma.studentIdentity.findUnique({
        where: { studentNo: input.studentNo },
        select: { userId: true, status: true },
      });
      if (
        identity?.userId ||
        identity?.status === StudentIdentityStatus.ACTIVATED
      ) {
        throw new StudentClaimError(BOUND_IDENTITY_MESSAGE, 409, {
          studentNo: [BOUND_IDENTITY_MESSAGE],
        });
      }
      throw new StudentClaimError("该邮箱已被注册", 409, {
        email: ["该邮箱已被注册"],
      });
    }
    throw error;
  }
}
