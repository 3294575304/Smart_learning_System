import "server-only";
import { randomUUID } from "node:crypto";
import {
  loadConversationForQuestion,
  replaceStreamingLearningReply,
  saveConversationTurn,
} from "./history";

import { prisma } from "@/lib/prisma";
import { hasActiveExamAttempt } from "@/services/exams/assistant-policy";
import { AuthorizationError } from "@/services/auth/policy";
import { createAIProvider } from "@/services/ai/provider-factory";
import { listStudentPracticeCourses } from "@/services/course-recommendations/service";
import { getStudentPublishedKnowledgeGraph } from "@/services/knowledge-graph/service";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";
import { getSystemConfig } from "@/services/system-config/service";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import {
  answerLearningQuestion,
  restrictLearningInput,
  LEARNING_ASSISTANT_PROMPT_VERSION,
  LEARNING_ASSISTANT_STREAM_PROMPT_VERSION,
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
import { learningEventResponse, readLearningAnswerStream } from "./stream";

export async function askCourseLearningAssistant(
  studentId: string,
  courseId: string,
  rawInput: unknown,
  options?: { signal: AbortSignal; stream: boolean },
): Promise<LearningAssistantReply | Response> {
  const request = learningAssistantRequestSchema.parse(rawInput);
  const courses = await listStudentPracticeCourses(studentId);
  const { course, topic, conceptIds } = resolveAuthorizedLearningTopic(
    courses,
    courseId,
    request.topic,
  );
  await assertLearningAssistantAvailable(studentId);
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
      .filter((turn) => turn.reply.deliveryStatus !== "ABORTED")
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
  const graphVersion = graph.published.versionNumber;
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
      provider = createAIProvider({
        capability: "learning_assistant",
        actorId: studentId,
        requestId,
      });
    } catch {
      provider = null;
    }
  }
  if (provider) await assertLearningAssistantAvailable(studentId);
  const save = (reply: LearningAssistantReply) =>
    saveConversationTurn({
      studentId,
      courseId,
      topicName: topic.name,
      request,
      requestId,
      question: sanitize(request.text),
      reply,
      record: conversation.record,
    });
  const buildReply = (
    response: Awaited<ReturnType<typeof answerLearningQuestion>>,
    promptVersion: string,
  ): LearningAssistantReply => {
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
      graphVersion,
      profileRevision: profile.revisionNumber,
      promptVersion,
      provider: provider?.name ?? null,
      model: provider?.model ?? null,
    };
    return reply;
  };

  if (
    options?.stream &&
    process.env.LEARNING_ASSISTANT_STREAM_DISABLED !== "true" &&
    provider?.supportsCourseLearningStream &&
    provider.streamCourseLearningQuestion &&
    !restrictLearningInput(input)
  ) {
    const streamQuestion = provider.streamCourseLearningQuestion.bind(provider);
    const abortedReply = (
      text: string,
      status: "PENDING" | "ABORTED",
    ): LearningAssistantReply => ({
      status: "ANSWER",
      answer: text || "本轮尚未生成可保存的回答。",
      learningObservation: "",
      advice: [],
      objectiveSummary: "",
      canOfferAdvice: false,
      practiceUrl: null,
      testUrl: null,
      fallbackUsed: false,
      graphVersion,
      profileRevision: profile.revisionNumber,
      promptVersion: LEARNING_ASSISTANT_STREAM_PROMPT_VERSION,
      provider: provider?.name ?? null,
      model: provider?.model ?? null,
      deliveryStatus: status,
    });
    options.signal.throwIfAborted();
    const saved = await save(abortedReply("", "PENDING"));
    if (saved.reply.deliveryStatus !== "PENDING")
      return { ...saved.reply, conversationId: saved.id };
    const replace = (reply: LearningAssistantReply) =>
      replaceStreamingLearningReply(
        studentId,
        courseId,
        saved.id,
        requestId,
        reply,
      );
    return learningEventResponse(
      options.signal,
      async (emit, requestSignal) => {
        let published = "";
        emit({ type: "start", conversationId: saved.id });
        const signal = AbortSignal.any([
          requestSignal,
          AbortSignal.timeout(12_000),
        ]);
        let final: LearningAssistantReply;
        try {
          let response: Awaited<ReturnType<typeof answerLearningQuestion>>;
          let promptVersion = LEARNING_ASSISTANT_STREAM_PROMPT_VERSION;
          try {
            response = await readLearningAnswerStream(
              streamQuestion,
              input,
              signal,
              async (text) => {
                signal.throwIfAborted();
                await assertLearningAssistantAvailable(studentId);
                signal.throwIfAborted();
                const safe = sanitize(text);
                if (!safe || safe === published) return;
                await replace(abortedReply(safe, "PENDING"));
                published = safe;
                if (!signal.aborted) emit({ type: "preview", text: safe });
              },
            );
          } catch (error) {
            if (published || signal.aborted) throw error;
            await assertLearningAssistantAvailable(studentId);
            response = await answerLearningQuestion(
              provider,
              input,
              12_000,
              signal,
            );
            promptVersion = LEARNING_ASSISTANT_PROMPT_VERSION;
          }
          signal.throwIfAborted();
          await assertLearningAssistantAvailable(studentId);
          signal.throwIfAborted();
          final = {
            ...buildReply(response, promptVersion),
            deliveryStatus: response.fallbackUsed ? "DEGRADED" : "ANSWER",
          };
        } catch {
          final = abortedReply(published, "ABORTED");
        }
        await replace(final);
        if (!requestSignal.aborted) {
          await assertLearningAssistantAvailable(studentId);
          emit({ type: "done", reply: { ...final, conversationId: saved.id } });
        }
      },
    );
  }

  const response = await answerLearningQuestion(
    provider,
    input,
    12_000,
    options?.signal,
  );
  options?.signal.throwIfAborted();
  await assertLearningAssistantAvailable(studentId);
  const saved = await save(
    buildReply(response, LEARNING_ASSISTANT_PROMPT_VERSION),
  );
  return { ...saved.reply, conversationId: saved.id };
}

async function assertLearningAssistantAvailable(studentId: string) {
  if (await hasActiveExamAttempt(studentId))
    throw new AuthorizationError("考试作答期间，课程答疑暂不可用。");
}
