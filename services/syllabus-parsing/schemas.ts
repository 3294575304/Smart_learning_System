import { z } from "zod";

const nullableText = z.string().trim().min(1).max(4_000).nullable();
const nullableNumber = z.number().finite().nonnegative().nullable();
const codeSchema = z.string().trim().min(1).max(100);

export const syllabusCourseInfoSchema = z
  .object({
    courseName: z.string().trim().min(1).max(200).nullable(),
    courseCode: z.string().trim().min(1).max(100).nullable(),
    credits: nullableNumber,
    totalHours: nullableNumber,
    theoryHours: nullableNumber,
    practiceHours: nullableNumber,
  })
  .strict();

const syllabusObjectiveSchema = z
  .object({
    code: codeSchema,
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(6_000),
  })
  .strict();

const syllabusKnowledgePointSchema = z
  .object({
    code: codeSchema,
    name: z.string().trim().min(1).max(300),
    description: nullableText,
    importance: z.enum(["CORE", "NORMAL", "EXTENDED"]),
  })
  .strict();

const syllabusChapterSchema = z
  .object({
    code: codeSchema,
    title: z.string().trim().min(1).max(300),
    description: nullableText,
    suggestedHours: nullableNumber,
    order: z.number().int().positive(),
    knowledgePoints: z.array(syllabusKnowledgePointSchema).max(300),
  })
  .strict()
  .superRefine((chapter, context) => {
    const codes = chapter.knowledgePoints.map((point) => point.code);
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: "custom",
        path: ["knowledgePoints"],
        message: "同一章节中的知识点编码不能重复",
      });
    }
  });

const syllabusAssessmentSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    type: z.string().trim().min(1).max(100),
    weight: z.number().finite().min(0).max(100).nullable(),
    description: nullableText,
  })
  .strict();

export const syllabusParseOutputSchema = z
  .object({
    courseInfo: syllabusCourseInfoSchema,
    objectives: z.array(syllabusObjectiveSchema).max(100),
    chapters: z.array(syllabusChapterSchema).max(200),
    assessments: z.array(syllabusAssessmentSchema).max(100),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const uniqueFields: Array<{
      values: Array<string | number>;
      path: string;
      message: string;
    }> = [
      {
        values: value.objectives.map((item) => item.code),
        path: "objectives",
        message: "课程目标编码不能重复",
      },
      {
        values: value.chapters.map((item) => item.code),
        path: "chapters",
        message: "章节编码不能重复",
      },
      {
        values: value.chapters.map((item) => item.order),
        path: "chapters",
        message: "章节顺序不能重复",
      },
    ];
    for (const field of uniqueFields) {
      if (new Set(field.values).size !== field.values.length) {
        context.addIssue({
          code: "custom",
          path: [field.path],
          message: field.message,
        });
      }
    }
  });

export const syllabusParseInputSchema = z
  .object({
    courseHint: z
      .object({
        name: z.string().trim().min(1).max(100),
        courseNo: z.string().trim().min(1).max(50),
        term: z.string().trim().min(1).max(50),
      })
      .strict(),
    pages: z
      .array(
        z
          .object({
            pageNumber: z.number().int().positive(),
            text: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();

export type SyllabusParseInput = z.output<typeof syllabusParseInputSchema>;
export type SyllabusParseOutput = z.output<typeof syllabusParseOutputSchema>;
