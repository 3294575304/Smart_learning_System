import { z } from "zod";

export const learningAssistantRequestSchema = z
  .object({
    topic: z
      .object({
        kind: z.enum(["COURSE", "KNOWLEDGE_POINT", "CHAPTER"]),
        id: z.string().trim().min(1).max(128),
      })
      .strict(),
    conversationId: z.string().trim().min(1).max(128).optional(),
    requestId: z.string().uuid().optional(),
    text: z.string().trim().min(2).max(2000),
    phase: z.enum(["QUESTION", "ADVICE"]).default("QUESTION"),
    history: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().trim().min(1).max(4000),
          })
          .strict(),
      )
      .max(6)
      .default([]),
  })
  .strict();

export const learningAssistantOutputSchema = z
  .object({
    status: z.enum(["ANSWER", "OUT_OF_SCOPE", "SAFE_REDIRECT"]),
    answer: z.string().trim().min(1).max(4000),
    learningObservation: z.string().trim().max(600),
    advice: z.array(z.string().trim().min(1).max(500)).max(5),
    topicCode: z.string().trim().min(1).max(128).nullable().optional(),
  })
  .strict();

export type LearningAssistantRequest = z.output<
  typeof learningAssistantRequestSchema
>;
export type LearningAssistantOutput = z.output<
  typeof learningAssistantOutputSchema
>;
export interface LearningAssistantInput extends LearningAssistantRequest {
  topicName: string;
  topicDescription: string;
  masteryOverview: string;
  concepts: Array<{ code?: string; name: string; description: string }>;
}
export const learningPracticeSuggestionSchema = z
  .object({
    scopeLabel: z.string().max(3000),
    note: z.string().max(300),
    count: z.number().int().min(1).max(50),
    typeLabel: z.string().max(100),
    difficulty: z.number().int().min(1).max(5),
    practiceUrl: z.string().max(3000),
    testUrl: z.string().max(3000),
  })
  .strict();
export interface LearningAssistantReply extends LearningAssistantOutput {
  conversationId?: string;
  practiceSuggestion?: z.output<typeof learningPracticeSuggestionSchema>;
  objectiveSummary: string;
  canOfferAdvice: boolean;
  practiceUrl: string | null;
  testUrl: string | null;
  fallbackUsed: boolean;
  graphVersion: number;
  profileRevision: number | null;
  promptVersion: string;
  provider: string | null;
  model: string | null;
}

export const savedLearningTurnSchema = z
  .object({
    requestId: z.string().uuid(),
    question: z.string().min(1).max(2000),
    phase: z.enum(["QUESTION", "ADVICE"]),
    createdAt: z.string().datetime(),
    reply: learningAssistantOutputSchema
      .extend({
        objectiveSummary: z.string().max(10000),
        canOfferAdvice: z.boolean(),
        practiceSuggestion: learningPracticeSuggestionSchema.optional(),
        practiceUrl: z.string().max(3000).nullable(),
        testUrl: z.string().max(3000).nullable(),
        fallbackUsed: z.boolean(),
        graphVersion: z.number().int(),
        profileRevision: z.number().int().nullable(),
        promptVersion: z.string(),
        provider: z.string().nullable(),
        model: z.string().nullable(),
        conversationId: z.string().optional(),
      })
      .strict(),
  })
  .strict();
export const savedLearningTurnsSchema = z
  .array(savedLearningTurnSchema)
  .max(40);
export type SavedLearningTurn = z.output<typeof savedLearningTurnSchema>;
export interface LearningConversationSummary {
  id: string;
  title: string;
  topic: {
    kind: "COURSE" | "KNOWLEDGE_POINT" | "CHAPTER";
    id: string;
    name: string;
  };
  updatedAt: string;
  turnCount: number;
}
export interface LearningConversationDetail extends LearningConversationSummary {
  turns: SavedLearningTurn[];
}
export interface LearningConversationList {
  items: LearningConversationSummary[];
  nextPage: number | null;
}
export const learningHistoryQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
  .strict();
