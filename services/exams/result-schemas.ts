import { z } from "zod";

export const examMonitorScope = z.object({
  examId: z.string().cuid(),
  classroomId: z.string().cuid(),
});

export const examPublicationPolicy = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("MANUAL") }).strict(),
  z.object({ mode: z.literal("WHEN_READY") }).strict(),
  z
    .object({
      mode: z.literal("SCHEDULED"),
      scheduledAt: z.string().datetime(),
    })
    .strict(),
]);

export const examResultManagementAction = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("POLICY"), policy: examPublicationPolicy })
    .strict(),
  z
    .object({
      action: z.literal("RESOLVE_REVIEW"),
      reviewId: z.string().cuid(),
      response: z.string().trim().min(2).max(1000),
    })
    .strict(),
]);

export const examReviewRequest = z
  .object({
    submissionId: z.string().cuid(),
    reason: z.string().trim().min(2).max(1000),
  })
  .strict();
