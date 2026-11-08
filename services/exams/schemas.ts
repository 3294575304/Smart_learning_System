import { ExamType, QuestionType } from "@prisma/client";
import { z } from "zod";

export const teacherExamListSchema = z.object({
  courseId: z.string().cuid().optional(),
  classroomId: z.string().cuid().optional(),
});

export const examCreateSchema = z
  .object({
    requestId: z.string().uuid(),
    courseId: z.string().cuid(),
    classroomIds: z
      .array(z.string().cuid())
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    type: z.nativeEnum(ExamType),
    title: z.string().trim().min(2).max(120),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    allowedSwitches: z.number().int().min(0).max(20),
    questions: z
      .array(
        z.object({
          questionId: z.string().cuid(),
          points: z.number().positive().max(10000),
        }),
      )
      .min(1)
      .max(200)
      .refine(
        (items) =>
          new Set(items.map((item) => item.questionId)).size === items.length,
      ),
  })
  .refine((value) => value.startsAt < value.endsAt, {
    path: ["endsAt"],
    message: "截止时间必须晚于开考时间",
  });

export const examQuestionQuerySchema = z.object({
  courseId: z.string().cuid(),
  startsAt: z.coerce.date(),
  questionType: z.nativeEnum(QuestionType).optional(),
  objectiveCode: z.string().trim().min(1).max(50).optional(),
  conceptId: z.string().cuid().optional(),
});
export const examSwitchSchema = z.object({ eventKey: z.string().uuid() });
export type ExamCreateInput = z.output<typeof examCreateSchema>;
