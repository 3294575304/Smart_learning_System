import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RecommendationOperationError } from "./errors";
export async function runPracticeSerializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  options: {
    isolationLevel: typeof Prisma.TransactionIsolationLevel.Serializable;
  } = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(operation, options);
    } catch (error: unknown) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(error.code);
      if (!retryable) throw error;
      if (attempt === 2)
        throw new RecommendationOperationError(
          "练习生成发生并发冲突，请重试同一请求",
          409,
        );
    }
  }
  throw new RecommendationOperationError(
    "练习生成发生并发冲突，请重试同一请求",
    409,
  );
}
