import { readSseData } from "@/lib/sse";
import {
  learningAssistantReplySchema,
  learningStreamEventSchema,
  type LearningAssistantRequest,
  type LearningStreamEvent,
} from "@/services/learning-assistant/schemas";

export async function requestLearningAnswer(
  url: string,
  input: LearningAssistantRequest,
  signal: AbortSignal,
  onEvent: (
    event: Extract<LearningStreamEvent, { type: "start" | "preview" }>,
  ) => void,
) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    },
    body: JSON.stringify(input),
    signal,
  }).catch(() => {
    signal.throwIfAborted();
    throw new Error("网络请求失败，请检查连接后重试");
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/event-stream")
  ) {
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.success === true) {
      const reply = learningAssistantReplySchema.safeParse(payload.data);
      if (reply.success) return reply.data;
    }
    throw new Error(
      typeof payload?.error === "string"
        ? payload.error
        : "学习助手暂时无法回答",
    );
  }
  if (!response.body) throw new Error("回答连接未建立");
  for await (const raw of readSseData(response.body)) {
    let event: LearningStreamEvent;
    try {
      event = learningStreamEventSchema.parse(JSON.parse(raw));
    } catch {
      throw new Error("回答格式异常，可在历史对话中查看已保存的内容");
    }
    if (event.type === "done") return event.reply;
    if (event.type === "error") throw new Error(event.message);
    onEvent(event);
  }
  throw new Error("回答连接已中断，可在历史对话中查看已保存的内容");
}
