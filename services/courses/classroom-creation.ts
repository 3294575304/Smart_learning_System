import {
  AuditAction,
  AuditTargetType,
  CourseStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { generateJoinCode } from "@/services/classrooms/join-code";
import type { CreateClassroomData } from "@/services/classrooms/schemas";
import { CourseOperationError } from "@/services/courses/errors";

const JOIN_CODE_ATTEMPTS = 8;

export async function createCourseClassroom(
  teacherId: string,
  courseId: string,
  input: CreateClassroomData,
  context: AuditRequestContext,
): Promise<{ id: string; name: string }> {
  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        // Serialize new classrooms for this course before checking duplicate names.
        await transaction.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "Course"
          WHERE "id" = ${courseId} AND "teacherId" = ${teacherId}
          FOR UPDATE
        `;
        const course = await transaction.course.findFirst({
          where: { id: courseId, teacherId },
          select: { id: true, name: true, status: true },
        });
        if (!course) throw new ResourceNotFoundError("课程不存在");
        if (course.status !== CourseStatus.ACTIVE) {
          throw new CourseOperationError("当前课程状态不能创建班级。", 409);
        }

        const duplicate = await transaction.classroom.findFirst({
          where: {
            courseId,
            name: { equals: input.name, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new CourseOperationError("当前课程已有同名班级。", 409);
        }

        const classroom = await transaction.classroom.create({
          data: {
            teacherId,
            courseId,
            name: input.name,
            description: input.description,
            allowStudentLeave: input.allowStudentLeave,
            joinCode: generateJoinCode(),
          },
          select: { id: true, name: true },
        });

        await writeGovernanceAuditLog(transaction, {
          actorId: teacherId,
          action: AuditAction.COURSE_CLASSROOM_LINKED,
          targetType: AuditTargetType.CLASSROOM,
          targetId: classroom.id,
          summary: `为课程 ${course.name} 创建班级 ${classroom.name}`,
          beforeData: null,
          afterData: {
            courseId,
            teacherId,
            classroomId: classroom.id,
            name: classroom.name,
            description: input.description,
            allowStudentLeave: input.allowStudentLeave,
          },
          context,
        });
        return classroom;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new CourseOperationError("邀请码生成失败，请稍后重试。", 500);
}
