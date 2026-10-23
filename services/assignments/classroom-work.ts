import type { Prisma } from "@prisma/client";
import { AssignmentOperationError } from "./errors";

/** Share the lifecycle row lock so completion cannot race a student write. */
export async function assertClassroomWorkAllowed(
  transaction: Prisma.TransactionClient,
  classroomId: string,
) {
  const rows = await transaction.$queryRaw<
    Array<{ status: string }>
  >`SELECT "status"::text AS "status" FROM "Classroom" WHERE "id" = ${classroomId} FOR SHARE`;
  if (rows[0]?.status !== "ACTIVE")
    throw new AssignmentOperationError(
      "班级已结课或已关闭，不能继续作答；历史记录保留",
    );
}
