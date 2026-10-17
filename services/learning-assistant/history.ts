import "server-only";
import {
  MembershipStatus,
  Prisma,
  type StudentLearningConversation,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import {
  savedLearningTurnsSchema,
  type LearningConversationDetail,
  type LearningConversationList,
  type LearningConversationSummary,
  type LearningAssistantReply,
  type LearningAssistantRequest,
} from "./schemas";

export async function assertHistoryCourse(studentId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      classrooms: {
        some: {
          status: "ACTIVE",
          memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
        },
      },
    },
    select: { id: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
}
function summary(
  record: Pick<
    StudentLearningConversation,
    | "id"
    | "topicKind"
    | "topicId"
    | "topicName"
    | "title"
    | "updatedAt"
    | "revision"
  >,
): LearningConversationSummary {
  const kind =
    record.topicKind === "COURSE"
      ? "COURSE"
      : record.topicKind === "CHAPTER"
        ? "CHAPTER"
        : "KNOWLEDGE_POINT";
  return {
    id: record.id,
    title: record.title,
    topic: { kind, id: record.topicId, name: record.topicName },
    updatedAt: record.updatedAt.toISOString(),
    turnCount: record.revision,
  };
}
export async function listLearningConversations(
  studentId: string,
  courseId: string,
  page: number,
): Promise<LearningConversationList> {
  await assertHistoryCourse(studentId, courseId);
  const records = await prisma.studentLearningConversation.findMany({
    where: { studentId, courseId, deletedAt: null, revision: { gt: 0 } },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      topicKind: true,
      topicId: true,
      topicName: true,
      title: true,
      updatedAt: true,
      revision: true,
    },
    skip: (page - 1) * 20,
    take: 21,
  });
  return {
    items: records.slice(0, 20).map(summary),
    nextPage: records.length > 20 ? page + 1 : null,
  };
}
export async function getLearningConversation(
  studentId: string,
  courseId: string,
  id: string,
): Promise<LearningConversationDetail> {
  await assertHistoryCourse(studentId, courseId);
  const record = await prisma.studentLearningConversation.findFirst({
    where: { id, studentId, courseId, deletedAt: null },
  });
  if (!record) throw new ResourceNotFoundError("对话不存在");
  return {
    ...summary(record),
    turns: savedLearningTurnsSchema.parse(record.turns),
  };
}
export async function deleteLearningConversation(
  studentId: string,
  courseId: string,
  id: string,
) {
  await assertHistoryCourse(studentId, courseId);
  // Clear the transcript as well as removing the history entry; deletion is student-owned and irreversible.
  const result = await prisma.studentLearningConversation.updateMany({
    where: { id, studentId, courseId },
    data: { deletedAt: new Date(), turns: [], title: "已删除的对话" },
  });
  if (!result.count) throw new ResourceNotFoundError("对话不存在");
  return { deleted: true };
}
export async function loadConversationForQuestion(
  studentId: string,
  courseId: string,
  request: LearningAssistantRequest,
  requestId: string,
) {
  const record = await prisma.studentLearningConversation.findFirst({
    where: {
      studentId,
      courseId,
      deletedAt: null,
      ...(request.conversationId
        ? { id: request.conversationId }
        : { firstRequestId: requestId }),
    },
  });
  if (request.conversationId && !record)
    throw new ResourceNotFoundError("对话不存在");
  if (
    record &&
    (record.topicKind !== request.topic.kind ||
      record.topicId !== request.topic.id)
  )
    throw new RecommendationOperationError("对话主题不一致，请新建对话", 409);
  const turns = record ? savedLearningTurnsSchema.parse(record.turns) : [];
  const repeated = turns.find((turn) => turn.requestId === requestId);
  if (!repeated && turns.length >= 40)
    throw new RecommendationOperationError(
      "本次对话已达到 40 轮，请新建对话继续学习",
      409,
    );
  return { record, turns, repeated };
}
export async function saveConversationTurn(input: {
  studentId: string;
  courseId: string;
  topicName: string;
  request: LearningAssistantRequest;
  requestId: string;
  question: string;
  reply: LearningAssistantReply;
  record: StudentLearningConversation | null;
}) {
  const {
    record,
    request,
    requestId,
    question,
    reply,
    studentId,
    courseId,
    topicName,
  } = input;
  const turn = {
    requestId,
    question,
    phase: request.phase,
    reply,
    createdAt: new Date().toISOString(),
  };
  if (!record) {
    try {
      const created = await prisma.studentLearningConversation.create({
        data: {
          studentId,
          courseId,
          topicKind: request.topic.kind,
          topicId: request.topic.id,
          topicName,
          title: question.slice(0, 120),
          firstRequestId: requestId,
          turns: JSON.parse(
            JSON.stringify(savedLearningTurnsSchema.parse([turn])),
          ) as Prisma.InputJsonValue,
          revision: 1,
        },
      });
      return { id: created.id, reply };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2002"
      )
        throw error;
      const existing = await loadConversationForQuestion(
        studentId,
        courseId,
        request,
        requestId,
      );
      if (existing.repeated && existing.record)
        return { id: existing.record.id, reply: existing.repeated.reply };
      throw new RecommendationOperationError("对话状态已更新，请重试", 409);
    }
  }
  const turns = savedLearningTurnsSchema.parse([
    ...savedLearningTurnsSchema.parse(record.turns),
    turn,
  ]);
  const changed = await prisma.studentLearningConversation.updateMany({
    where: {
      id: record.id,
      studentId,
      courseId,
      deletedAt: null,
      revision: record.revision,
    },
    data: {
      turns: JSON.parse(JSON.stringify(turns)) as Prisma.InputJsonValue,
      revision: { increment: 1 },
    },
  });
  if (!changed.count) {
    const existing = await loadConversationForQuestion(
      studentId,
      courseId,
      request,
      requestId,
    );
    if (existing.repeated)
      return { id: record.id, reply: existing.repeated.reply };
    throw new RecommendationOperationError(
      "对话已变更，请重新提交；删除的对话不能恢复",
      409,
    );
  }
  return { id: record.id, reply };
}
