import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import { assertCanAccessRecommendation } from "@/services/recommendations/policy";
import { recommendationIdSchema } from "@/services/recommendations/schemas";
import { runPracticeSerializable } from "@/services/recommendations/transactions";
import { assertPracticeGroupWritable } from "./management";
import {
  practiceDraftSaveSchema,
  practiceDraftSnapshotSchema,
  type PracticeAccountDraft,
} from "./draft-schemas";
import { practiceDraftFilled } from "./submission";
import { canAnswerPractice } from "./types";

const draftSelect = {
  draftData: true,
  draftRevision: true,
  draftSavedAt: true,
} satisfies Prisma.PracticeSetManagementSelect;
const draftQuestionSelect = {
  id: true,
  status: true,
  expiresAt: true,
  practiceAnswer: { select: { id: true } },
  programmingAttempts: {
    where: { kind: "FORMAL_JUDGE" },
    take: 1,
    select: { id: true },
  },
  question: {
    select: {
      type: true,
      status: true,
      deletedAt: true,
      options: { select: { id: true } },
    },
  },
} satisfies Prisma.PersonalizedRecommendationSelect;

type DraftRow = Prisma.PracticeSetManagementGetPayload<{
  select: typeof draftSelect;
}>;
type DraftQuestion = Prisma.PersonalizedRecommendationGetPayload<{
  select: typeof draftQuestionSelect;
}>;

function submitted(question: DraftQuestion) {
  return (
    question.status === "COMPLETED" ||
    Boolean(question.practiceAnswer || question.programmingAttempts.length)
  );
}

function draftView(
  row: DraftRow | null,
  questions: DraftQuestion[],
): PracticeAccountDraft {
  const parsed = practiceDraftSnapshotSchema.safeParse(row?.draftData);
  const eligible = new Set(
    questions
      .filter((question) => !submitted(question))
      .map((question) => question.id),
  );
  return {
    snapshot: parsed.success
      ? {
          current: parsed.data.current,
          drafts: Object.fromEntries(
            Object.entries(parsed.data.drafts).filter(([id]) =>
              eligible.has(id),
            ),
          ),
        }
      : null,
    revision: row?.draftRevision ?? 0,
    savedAt: row?.draftSavedAt?.toISOString() ?? null,
  };
}

export class PracticeDraftConflict extends RecommendationOperationError {
  constructor() {
    super("草稿已在其他页面更新，请选择要保留的版本。", 409);
  }
}

export async function getPracticeAccountDraft(
  actor: AuthenticatedUser,
  rawId: unknown,
) {
  assertCanAccessRecommendation(actor, actor.id);
  const anchor = await prisma.personalizedRecommendation.findFirst({
    where: { id: recommendationIdSchema.parse(rawId), studentId: actor.id },
    select: { cycleKey: true },
  });
  if (!anchor) throw new ResourceNotFoundError("练习组不存在");
  const where = { studentId: actor.id, cycleKey: anchor.cycleKey };
  const questions = await prisma.personalizedRecommendation.findMany({
    where,
    select: draftQuestionSelect,
  });
  const row = await prisma.practiceSetManagement.findUnique({
    where: { studentId_cycleKey: where },
    select: { ...draftSelect, purgedAt: true },
  });
  if (row?.purgedAt) throw new ResourceNotFoundError("练习组不存在");
  return draftView(row, questions);
}

export async function savePracticeAccountDraft(
  actor: AuthenticatedUser,
  rawId: unknown,
  raw: unknown,
) {
  assertCanAccessRecommendation(actor, actor.id);
  const id = recommendationIdSchema.parse(rawId);
  const input = practiceDraftSaveSchema.parse(raw);
  return runPracticeSerializable(async (tx) => {
    const { cycleKey, managementId } = await assertPracticeGroupWritable(
      tx,
      actor.id,
      id,
    );
    const questions = await tx.personalizedRecommendation.findMany({
      where: { studentId: actor.id, cycleKey },
      select: draftQuestionSelect,
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    const now = new Date();
    const writable = (q: DraftQuestion) =>
      canAnswerPractice(q) &&
      (!q.expiresAt || q.expiresAt > now) &&
      q.question.status === "ACTIVE" &&
      !q.question.deletedAt &&
      !submitted(q);
    if (!byId.has(input.current))
      throw new RecommendationOperationError("题号不属于本组练习", 400);
    // A fully submitted group can still replay the last save after a lost response.
    const row = await tx.practiceSetManagement.findUniqueOrThrow({
      where: { id: managementId },
      select: draftSelect,
    });
    const previous = draftView(row, questions);
    const drafts: NonNullable<PracticeAccountDraft["snapshot"]>["drafts"] = {};
    for (const [questionId, answer] of Object.entries(input.drafts)) {
      const q = byId.get(questionId);
      if (!q) throw new RecommendationOperationError("答案不属于本组练习", 400);
      if (!writable(q) || !practiceDraftFilled(answer)) continue;
      const { type, options } = q.question;
      if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") {
        if (
          answer.kind !== "CHOICE" ||
          new Set(answer.optionIds).size !== answer.optionIds.length ||
          (type === "SINGLE_CHOICE" && answer.optionIds.length > 1) ||
          answer.optionIds.some(
            (optionId) => !options.some((option) => option.id === optionId),
          )
        )
          throw new RecommendationOperationError("草稿中有无效选项", 400);
        drafts[questionId] = {
          ...answer,
          optionIds: [...answer.optionIds].sort(),
        };
      } else {
        const kind =
          type === "TRUE_FALSE"
            ? "BOOLEAN"
            : type === "PYTHON_PROGRAMMING"
              ? "CODE"
              : "TEXT";
        if (answer.kind !== kind)
          throw new RecommendationOperationError("草稿答案与题型不符", 400);
        drafts[questionId] = answer;
      }
    }
    // Keep drafts for individual questions that closed while the rest of the group is open.
    for (const q of questions) {
      const saved = previous.snapshot?.drafts[q.id];
      if (saved && !writable(q)) drafts[q.id] = saved;
    }
    const snapshot = { current: input.current, drafts };
    if (isDeepStrictEqual(previous.snapshot, snapshot)) return previous;
    if (!questions.some(writable))
      throw new RecommendationOperationError(
        "练习已结束或已提交，只能回看记录",
        409,
      );
    if (input.expectedRevision !== row.draftRevision)
      throw new PracticeDraftConflict();
    const updated = await tx.practiceSetManagement.update({
      where: { id: managementId },
      data: {
        draftData: snapshot,
        draftRevision: { increment: 1 },
        draftSavedAt: now,
      },
      select: draftSelect,
    });
    return draftView(updated, questions);
  });
}
