import { ProgrammingTestVisibility } from "@prisma/client";
import { z } from "zod";

const preciseScore = z
  .number()
  .positive()
  .max(10_000)
  .refine((value) => Number.isInteger(value * 100), "分值最多保留两位小数");

export const programmingLimitsSchema = z
  .object({
    cpuTimeMs: z.number().int().min(10).max(30_000),
    wallTimeMs: z.number().int().min(10).max(60_000),
    memoryBytes: z.number().int().min(1_048_576).max(536_870_912),
    outputBytes: z.number().int().min(1_024).max(1_048_576),
    processCount: z.number().int().min(1).max(64),
  })
  .strict();

export const programmingTestCaseInputSchema = z
  .object({
    visibility: z.nativeEnum(ProgrammingTestVisibility),
    name: z.string().trim().min(1).max(100),
    stdin: z.string().max(65_536),
    expectedOutput: z.string().max(65_536),
    points: preciseScore,
    sortOrder: z.number().int().min(1).max(1_000),
  })
  .strict();

export const programmingConfigRevisionInputSchema = z
  .object({
    standardCode: z.string().min(1).max(200_000),
    starterCode: z.string().max(200_000),
    totalPoints: preciseScore,
    limits: programmingLimitsSchema,
    testCases: z.array(programmingTestCaseInputSchema).min(2).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const orders = value.testCases.map((testCase) => testCase.sortOrder);
    if (new Set(orders).size !== orders.length) {
      context.addIssue({
        code: "custom",
        path: ["testCases"],
        message: "测试用例顺序不能重复",
      });
    }
    if (
      !value.testCases.some(
        (testCase) => testCase.visibility === ProgrammingTestVisibility.PUBLIC,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["testCases"],
        message: "至少需要一个公开样例",
      });
    }
    if (
      !value.testCases.some(
        (testCase) => testCase.visibility === ProgrammingTestVisibility.HIDDEN,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["testCases"],
        message: "至少需要一个隐藏用例",
      });
    }
    const casePoints = value.testCases.reduce(
      (sum, testCase) => sum + Math.round(testCase.points * 100),
      0,
    );
    if (casePoints !== Math.round(value.totalPoints * 100)) {
      context.addIssue({
        code: "custom",
        path: ["totalPoints"],
        message: "测试用例分值总和必须等于题目总分",
      });
    }
  });

export const programmingQuestionPathSchema = z.object({
  questionId: z.string().cuid(),
});

export type ProgrammingConfigRevisionInput = z.infer<
  typeof programmingConfigRevisionInputSchema
>;
