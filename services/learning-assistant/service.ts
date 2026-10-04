import "server-only";
import { randomUUID } from "node:crypto";
import { loadConversationForQuestion, saveConversationTurn } from "./history";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import { listStudentPracticeCourses } from "@/services/course-recommendations/service";
import { getStudentPublishedKnowledgeGraph } from "@/services/knowledge-graph/service";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";
import { getSystemConfig } from "@/services/system-config/service";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import {
  answerLearningQuestion,
  LEARNING_ASSISTANT_PROMPT_VERSION,
} from "./ai";
import {
  learningAssistantRequestSchema,
  type LearningAssistantReply,
} from "./schemas";
import {
  resolveAuthorizedLearningTopic,
  suggestLearningPractice,
} from "./context";
import { sanitizeLearningText, summarizeTopicMastery } from "./policy";

export async function askCourseLearningAssistant(
  studentId: string,
  courseId: string,
  rawInput: unknown,
): Promise<LearningAssistantReply> {
  const request = learningAssistantRequestSchema.parse(rawInput);
  const courses = await listStudentPracticeCourses(studentId);
  const { course, topic, conceptIds } = resolveAuthorizedLearningTopic(
    courses,
    courseId,
    request.topic,
  );
  const requestId = request.requestId ?? randomUUID();
  const conversation = await loadConversationForQuestion(
    studentId,
    courseId,
    request,
    requestId,
  );
  if (conversation.repeated && conversation.record)
    return {
      ...conversation.repeated.reply,
      conversationId: conversation.record.id,
    };
  if (conversation.record)
    request.history = conversation.turns
      .flatMap((turn) => [
        { role: "user" as const, content: turn.question },
        { role: "assistant" as const, content: turn.reply.answer },
      ])
      .slice(-6);
  const graph = await getStudentPublishedKnowledgeGraph(studentId, courseId);
  if (
    !graph.published ||
    graph.published.versionNumber !== course.graphVersionNumber
  )
    throw new RecommendationOperationError(
      "课程图谱已更新，请刷新后继续提问",
      409,
    );
  const stableKeys = new Set(
    graph.published.concepts
      .filter((item) => conceptIds.includes(item.conceptId))
      .map((item) => item.stableKey),
  );
  const nodes = graph.published.structure.nodes.filter(
    (node) =>
      node.type === "KNOWLEDGE_POINT" && stableKeys.has(node.conceptKey),
  );
  const privateUser = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      email: true,
      profile: { select: { displayName: true, studentNo: true } },
    },
  });
  const privateValues = [
    privateUser?.email,
    privateUser?.profile?.displayName,
    privateUser?.profile?.studentNo,
  ].filter((value): value is string => Boolean(value));
  const sanitize = (value: string) =>
    sanitizeLearningText(value, privateValues);
  const profile = await getStudentLearnerProfile(studentId, courseId);
  const objectiveSummary = summarizeTopicMastery(
    course.concepts
      .filter((item) => conceptIds.includes(item.id))
      .map((item) => {
        const entry = profile.concepts.find(
          (current) => current.conceptId === item.id,
        );
        return {
          name: item.name,
          evidenceState: entry?.evidenceState ?? "NO_EVIDENCE",
          masteryScore: entry?.masteryScore ?? null,
        };
      }),
    request.topic.kind === "COURSE" ? "课程" : "本章",
  );
  // 只发送当前主题的课程说明和脱敏对话；客观画像在本地形成摘要，不发送学生身份或原始作答。
  const input = {
    ...request,
    text: sanitize(request.text),
    history: request.history.map((item) => ({
      ...item,
      content: sanitize(item.content),
    })),
    topicName: sanitize(topic.name),
    masteryOverview: sanitize(objectiveSummary),
    topicDescription: sanitize(
      graph.published.structure.nodes.find((node) => node.code === topic.code)
        ?.description ?? "",
    ),
    concepts: nodes.slice(0, 100).map((node) => ({
      code: node.code,
      name: sanitize(node.name),
      description: sanitize(node.description ?? ""),
    })),
  };
  const config = await getSystemConfig();
  let provider = null;
  if (config.aiAnalysisEnabled) {
    try {
      provider = createAIProvider();
    } catch {
      provider = null;
    }
  }
  const response = await answerLearningQuestion(provider, input);
  const relevant =
    response.output.status === "ANSWER" && !response.fallbackUsed;
  const priorQuestion =
    request.history.filter((item) => item.role === "user").at(-1)?.content ??
    "";
  const suggestion =
    response.output.status === "ANSWER"
      ? (suggestLearningPractice(
          course,
          request.topic,
          request.text,
          response.output.topicCode,
        ) ??
        (/刚才|这个主题|继续|需要|好的|给我/u.test(request.text)
          ? suggestLearningPractice(
              course,
              request.topic,
              priorQuestion,
              response.output.topicCode,
            )
          : null))
      : null;
  const reply: LearningAssistantReply = {
    ...response.output,
    // 回答以纯文本返回，且再次清理可能从模型回复中出现的个人标识。
    answer: sanitize(
      response.output.answer +
        (relevant && request.phase === "ADVICE" && !suggestion
          ? "\n为了匹配练习题，请说明你想练习的具体知识点或章节；也可以展开可选主题自行指定。"
          : ""),
    ),
    learningObservation: sanitize(response.output.learningObservation),
    advice: response.output.advice.map(sanitize),
    objectiveSummary:
      response.output.status === "ANSWER" ? objectiveSummary : "",
    canOfferAdvice: relevant && request.phase === "QUESTION",
    practiceUrl: suggestion?.practiceUrl ?? null,
    testUrl: suggestion?.testUrl ?? null,
    ...(suggestion ? { practiceSuggestion: suggestion } : {}),
    fallbackUsed: response.fallbackUsed,
    graphVersion: graph.published.versionNumber,
    profileRevision: profile.revisionNumber,
    promptVersion: LEARNING_ASSISTANT_PROMPT_VERSION,
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
  };
  const saved = await saveConversationTurn({
    studentId,
    courseId,
    topicName: topic.name,
    request,
    requestId,
    question: sanitize(request.text),
    reply,
    record: conversation.record,
  });
  return { ...saved.reply, conversationId: saved.id };
}
