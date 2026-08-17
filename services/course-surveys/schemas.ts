import {
  CourseSurveyDimension,
  CourseSurveyMode,
  CourseSurveyQuestionType,
  CourseSurveyStatus,
} from "@prisma/client";
import { z } from "zod";

import { COURSE_SURVEY_MAX_QUESTIONS } from "@/services/course-surveys/constants";

const questionSchema = z
  .object({
    id: z.string().cuid().optional(),
    type: z.nativeEnum(CourseSurveyQuestionType),
    dimension: z.nativeEnum(CourseSurveyDimension),
    prompt: z.string().trim().min(2, "题目至少需要 2 个字符").max(1000),
    required: z.boolean().default(true),
    sortOrder: z.number().int().min(1).max(COURSE_SURVEY_MAX_QUESTIONS),
    outcomeCode: z.string().trim().min(1).max(100).nullable().optional(),
    outcomeTitle: z.string().trim().min(1).max(300).nullable().optional(),
    sourceRefs: z
      .array(
        z
          .object({
            page: z.number().int().positive(),
            quote: z.string().trim().min(1).max(500).optional(),
            verified: z.boolean().optional(),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict();

function validateQuestionSet(
  questions: z.output<typeof questionSchema>[],
  context: z.RefinementCtx,
) {
  if (
    new Set(questions.map((item) => item.sortOrder)).size !== questions.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["questions"],
      message: "题目顺序不能重复",
    });
  }
  for (const [index, question] of questions.entries()) {
    if (
      question.dimension === CourseSurveyDimension.OUTCOME_SELF_ASSESSMENT &&
      (!question.outcomeCode || !question.outcomeTitle)
    ) {
      context.addIssue({
        code: "custom",
        path: ["questions", index, "outcomeCode"],
        message: "课程目标自评题必须关联课程目标",
      });
    }
    if (
      question.type === CourseSurveyQuestionType.OPEN_TEXT &&
      question.dimension !== CourseSurveyDimension.OPEN_FEEDBACK
    ) {
      context.addIssue({
        code: "custom",
        path: ["questions", index, "dimension"],
        message: "开放题必须使用意见与建议维度",
      });
    }
  }
}

export const createCourseSurveySchema = z
  .object({
    classroomId: z.string().cuid("班级 ID 格式无效"),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(5000).default(""),
    instructions: z
      .string()
      .trim()
      .min(2)
      .max(3000)
      .default("本问卷不计入课程成绩，请根据真实学习体验作答。"),
    mode: z.nativeEnum(CourseSurveyMode).default(CourseSurveyMode.ANONYMOUS),
    opensAt: z.coerce.date(),
    dueAt: z.coerce.date(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueAt <= value.opensAt) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "截止时间必须晚于开放时间",
      });
    }
  });

export const updateCourseSurveySchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(5000).default(""),
    instructions: z.string().trim().min(2).max(3000),
    mode: z.nativeEnum(CourseSurveyMode),
    opensAt: z.coerce.date(),
    dueAt: z.coerce.date(),
    questions: z.array(questionSchema).min(1).max(COURSE_SURVEY_MAX_QUESTIONS),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.dueAt <= value.opensAt) {
      context.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "截止时间必须晚于开放时间",
      });
    }
    validateQuestionSet(value.questions, context);
  });

export const publishCourseSurveySchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const courseSurveyListQuerySchema = z
  .object({
    status: z.nativeEnum(CourseSurveyStatus).optional(),
    classroomId: z.string().cuid().optional(),
  })
  .strict();

const scaleAnswerSchema = z
  .object({
    questionId: z.string().cuid(),
    kind: z.literal("SCALE"),
    value: z.number().int().min(1).max(5),
  })
  .strict();

const textAnswerSchema = z
  .object({
    questionId: z.string().cuid(),
    kind: z.literal("TEXT"),
    value: z.string().trim().max(5000),
  })
  .strict();

export const submitCourseSurveySchema = z
  .object({
    idempotencyKey: z.string().uuid("幂等键格式无效"),
    answers: z
      .array(
        z.discriminatedUnion("kind", [scaleAnswerSchema, textAnswerSchema]),
      )
      .min(1)
      .max(COURSE_SURVEY_MAX_QUESTIONS),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.answers.map((item) => item.questionId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "同一道题不能重复作答",
      });
    }
  });

export const courseSurveyIdSchema = z.string().cuid("问卷 ID 格式无效");

export type CreateCourseSurveyInput = z.output<typeof createCourseSurveySchema>;
export type UpdateCourseSurveyInput = z.output<typeof updateCourseSurveySchema>;
export type SubmitCourseSurveyInput = z.output<typeof submitCourseSurveySchema>;
export type CourseSurveyListQuery = z.output<
  typeof courseSurveyListQuerySchema
>;
