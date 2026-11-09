import { z } from "zod";
import type { AIProvider } from "@/services/ai/provider";
import { validateLearningOutput } from "./ai";
import { learningRequestRestriction } from "./policy";
import type { LearningAssistantInput, LearningStreamEvent } from "./schemas";

const modelLineSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("status"),
      status: z.enum(["ANSWER", "OUT_OF_SCOPE", "SAFE_REDIRECT"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("block"),
      text: z.string().trim().min(1).max(800),
    })
    .strict(),
  z
    .object({
      type: z.literal("meta"),
      learningObservation: z.string().max(600),
      advice: z.array(z.string().max(500)).max(5),
      topicCode: z.string().max(128).nullable(),
    })
    .strict(),
]);

export async function readLearningAnswerStream(
  provider: NonNullable<AIProvider["streamCourseLearningQuestion"]>,
  input: LearningAssistantInput,
  signal: AbortSignal,
  publish: (text: string) => Promise<void>,
) {
  let buffer = "";
  let received = 0;
  let status: "ANSWER" | "OUT_OF_SCOPE" | "SAFE_REDIRECT" | undefined;
  let answer = "";
  let blocks = 0;
  let metadata:
    | {
        learningObservation: string;
        advice: string[];
        topicCode: string | null;
      }
    | undefined;

  async function accept(line: string) {
    signal.throwIfAborted();
    if (!line.trim()) return;
    const item = modelLineSchema.parse(JSON.parse(line));
    if (!status && item.type === "status") {
      status = item.status;
      return;
    }
    if (status !== "ANSWER" || metadata || item.type === "status")
      throw new Error("Unexpected assistant stream record");
    if (item.type === "meta") {
      const { learningObservation, advice, topicCode } = item;
      metadata = { learningObservation, advice, topicCode };
      return;
    }
    const next = answer ? `${answer}\n\n${item.text}` : item.text;
    if (++blocks > 8 || next.length > 4_000 || learningRequestRestriction(next))
      throw new Error("Assistant stream block rejected");
    await publish(next);
    answer = next;
  }

  await provider(input, {
    signal,
    async onText(chunk) {
      received += chunk.length;
      if (received > 24_000) throw new Error("Assistant stream too large");
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        await accept(line);
      }
    },
  });
  await accept(buffer);
  if (!status || (status === "ANSWER" && (!answer || !metadata)))
    throw new Error("Incomplete assistant response");
  const output = validateLearningOutput(
    {
      status,
      answer: answer || "课程答疑",
      learningObservation: metadata?.learningObservation ?? "",
      advice: metadata?.advice ?? [],
      topicCode: metadata?.topicCode ?? null,
    },
    input,
  );
  if (status === "ANSWER" && output.status !== "ANSWER")
    throw new Error("Assistant stream validation failed");
  return { output, fallbackUsed: false };
}

export function learningEventResponse(
  requestSignal: AbortSignal,
  run: (
    emit: (event: LearningStreamEvent) => void,
    signal: AbortSignal,
  ) => Promise<void>,
) {
  const canceled = new AbortController();
  const signal = AbortSignal.any([requestSignal, canceled.signal]);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: LearningStreamEvent) => {
        if (!signal.aborted)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
      };
      void run(emit, signal)
        .catch(() =>
          emit({ type: "error", message: "回答暂时无法完成，请稍后重试" }),
        )
        .finally(() => {
          if (!canceled.signal.aborted) controller.close();
        });
    },
    cancel() {
      canceled.abort();
    },
  });
  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
