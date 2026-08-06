import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { ConceptMasteryConcurrencyError } from "@/services/concept-mastery/errors";

function retryable(error: unknown): boolean {
  if (error instanceof ConceptMasteryConcurrencyError) return true;
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === "P2034" || error.code === "P2002";
}

export async function runAssignmentSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  conflictMessage: string,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (!retryable(error) || attempt === 2) {
        if (retryable(error))
          throw new AssignmentOperationError(conflictMessage, 409);
        throw error;
      }
    }
  }
  throw new AssignmentOperationError(conflictMessage, 409);
}
