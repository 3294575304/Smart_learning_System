import { Prisma, QuestionType } from "@prisma/client";

import { AssignmentOperationError } from "@/services/assignments/errors";

export async function freezeAssignmentProgrammingConfigs(
  transaction: Prisma.TransactionClient,
  assignmentId: string,
) {
  const programmingQuestions = await transaction.assignmentQuestion.findMany({
    where: { assignmentId, typeSnapshot: QuestionType.PYTHON_PROGRAMMING },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, questionId: true, points: true },
  });
  for (const assignmentQuestion of programmingQuestions) {
    const revision =
      await transaction.programmingQuestionConfigRevision.findFirst({
        where: { questionId: assignmentQuestion.questionId },
        orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
      });
    if (!revision) {
      throw new AssignmentOperationError(
        "Python 编程题缺少判题配置，无法发布作业",
        400,
      );
    }
    if (!assignmentQuestion.points.equals(revision.totalPoints)) {
      throw new AssignmentOperationError(
        `Python 编程题分值必须等于判题用例总分 ${revision.totalPoints.toFixed(2)}`,
        400,
      );
    }
    await transaction.assignmentProgrammingConfigSnapshot.create({
      data: {
        assignmentQuestionId: assignmentQuestion.id,
        configRevisionId: revision.id,
        configRevisionNumber: revision.revisionNumber,
        configurationHash: revision.configurationHash,
        testCasesHash: revision.testCasesHash,
        executorRuleVersion: revision.executorRuleVersion,
        cpuTimeMs: revision.cpuTimeMs,
        wallTimeMs: revision.wallTimeMs,
        memoryBytes: revision.memoryBytes,
        outputBytes: revision.outputBytes,
        processCount: revision.processCount,
      },
    });
  }
  return { frozenCount: programmingQuestions.length };
}
