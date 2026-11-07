import type { Prisma } from "@prisma/client";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { ClassroomOperationError } from "./errors";

/** Share the established retry strategy, returning errors in the classroom API contract. */
export async function runClassroomSerializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  message: string,
  timeoutMs = 5000,
) {
  try {
    return await runAssignmentSerializable(operation, message, timeoutMs);
  } catch (error) {
    if (error instanceof AssignmentOperationError)
      throw new ClassroomOperationError(error.message);
    throw error;
  }
}
