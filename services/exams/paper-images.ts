import "server-only";

import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { getStorageService } from "@/services/storage";

export async function readAssignmentQuestionImage(
  actor: { id: string; role: Role },
  imageId: string,
) {
  const image = await prisma.assignmentQuestionImage.findUnique({
    where: { id: imageId },
    include: {
      assignmentQuestion: {
        select: {
          assignment: {
            select: {
              teacherId: true,
              status: true,
              examSession: { select: { cancelledAt: true, startsAt: true } },
              classroom: {
                select: {
                  memberships: {
                    where: { studentId: actor.id, status: "ACTIVE" },
                    select: { id: true },
                  },
                },
              },
              submissions: {
                where: { studentId: actor.id, status: { not: "WITHDRAWN" } },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  const assignment = image?.assignmentQuestion.assignment;
  const teacher =
    actor.role === Role.TEACHER && assignment?.teacherId === actor.id;
  const student =
    actor.role === Role.STUDENT &&
    assignment &&
    assignment.status === "PUBLISHED" &&
    !assignment.examSession?.cancelledAt &&
    assignment.examSession &&
    assignment.examSession.startsAt <= new Date() &&
    (assignment.classroom.memberships.length > 0 ||
      assignment.submissions.length > 0);
  if (!image || (!teacher && !student))
    throw new ResourceNotFoundError("题目图片不存在");
  return {
    mimeType: image.mimeType,
    bytes: await getStorageService().read(image.storageKey),
  };
}
