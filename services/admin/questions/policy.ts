import { QuestionStatus, QuestionVisibility } from "@prisma/client";

import { GovernanceOperationError } from "@/services/admin/governance-errors";

export function assertQuestionVisibilityCanChange(input: {
  currentVisibility: QuestionVisibility;
  nextVisibility: QuestionVisibility;
  status: QuestionStatus;
  knowledgePointCount: number;
}): void {
  if (input.currentVisibility === input.nextVisibility) {
    throw new GovernanceOperationError(
      input.nextVisibility === QuestionVisibility.PUBLIC
        ? "该题目已经是公共题目"
        : "该题目已经是私有题目",
    );
  }
  if (
    input.nextVisibility === QuestionVisibility.PUBLIC &&
    (input.status !== QuestionStatus.ACTIVE || input.knowledgePointCount === 0)
  ) {
    throw new GovernanceOperationError(
      "只有状态正常且已关联知识点的题目才能设为公共",
      400,
    );
  }
}
