import { AssessmentComponentType, GradeSourceType } from "@prisma/client";
import { z } from "zod";

const codeSchema = z.string().trim().min(1).max(100);
const sourceRefSchema = z
  .object({
    page: z.number().int().positive(),
    quote: z.string().trim().min(1).max(500).optional(),
    verified: z.boolean(),
  })
  .strict();
const sourceRefsSchema = z.array(sourceRefSchema).max(20).default([]);

const rubricBandSchema = z
  .object({
    minScore: z.number().finite().min(0).max(100),
    maxScore: z.number().finite().min(0).max(100),
    label: z.string().trim().min(1).max(100),
    sourceRefs: sourceRefsSchema,
  })
  .strict()
  .refine((value) => value.minScore <= value.maxScore, {
    message: "评分区间下限不能大于上限",
  });

const outcomeSchema = z
  .object({
    code: codeSchema,
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().min(1).max(6_000),
    attainmentThreshold: z.number().finite().min(0).max(100).nullable(),
    sortOrder: z.number().int().positive(),
    sourceRefs: sourceRefsSchema,
  })
  .strict();

const mappingSchema = z
  .object({
    objectiveCode: codeSchema,
    allocationRate: z.number().finite().min(0).max(100).nullable(),
    sourceRefs: sourceRefsSchema,
  })
  .strict();

const componentSchema = z
  .object({
    code: codeSchema,
    name: z.string().trim().min(1).max(300),
    type: z.nativeEnum(AssessmentComponentType),
    fullScore: z.number().finite().positive().max(100_000).nullable(),
    weight: z.number().finite().min(0).max(100).nullable(),
    sourceType: z.nativeEnum(GradeSourceType).nullable(),
    sortOrder: z.number().int().positive(),
    enabled: z.boolean(),
    description: z.string().trim().max(4_000).nullable(),
    sourceRefs: sourceRefsSchema,
    mappings: z.array(mappingSchema).max(100),
    rubricBands: z.array(rubricBandSchema).max(20),
  })
  .strict();

export const assessmentSchemeStructureSchema = z
  .object({
    outcomes: z.array(outcomeSchema).max(100),
    components: z.array(componentSchema).max(100),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const duplicateIssue = (
      values: Array<string | number>,
      path: Array<string | number>,
      message: string,
    ) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", path, message });
      }
    };
    duplicateIssue(
      value.outcomes.map((item) => item.code),
      ["outcomes"],
      "课程目标编码不能重复",
    );
    duplicateIssue(
      value.outcomes.map((item) => item.sortOrder),
      ["outcomes"],
      "课程目标顺序不能重复",
    );
    duplicateIssue(
      value.components.map((item) => item.code),
      ["components"],
      "考核项目编码不能重复",
    );
    duplicateIssue(
      value.components.map((item) => item.sortOrder),
      ["components"],
      "考核项目顺序不能重复",
    );
    const outcomeCodes = new Set(value.outcomes.map((item) => item.code));
    value.components.forEach((component, componentIndex) => {
      duplicateIssue(
        component.mappings.map((item) => item.objectiveCode),
        ["components", componentIndex, "mappings"],
        "同一考核项目不能重复关联课程目标",
      );
      component.mappings.forEach((mapping, mappingIndex) => {
        if (!outcomeCodes.has(mapping.objectiveCode)) {
          context.addIssue({
            code: "custom",
            path: [
              "components",
              componentIndex,
              "mappings",
              mappingIndex,
              "objectiveCode",
            ],
            message: "映射引用了不存在的课程目标",
          });
        }
      });
    });
  });

export const publishableAssessmentSchemeSchema =
  assessmentSchemeStructureSchema.superRefine((value, context) => {
    if (value.outcomes.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["outcomes"],
        message: "正式考核方案至少需要一个课程目标",
      });
    }
    value.outcomes.forEach((outcome, index) => {
      if (outcome.attainmentThreshold === null) {
        context.addIssue({
          code: "custom",
          path: ["outcomes", index, "attainmentThreshold"],
          message: "课程目标达成阈值必须来自大纲或由教师明确补充",
        });
      }
    });
    const enabled = value.components.filter((item) => item.enabled);
    if (enabled.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["components"],
        message: "正式考核方案至少需要一个启用项目",
      });
    }
    enabled.forEach((component) => {
      const index = value.components.indexOf(component);
      if (component.fullScore === null) {
        context.addIssue({
          code: "custom",
          path: ["components", index, "fullScore"],
          message: "启用项目必须填写满分",
        });
      }
      if (component.weight === null || component.weight <= 0) {
        context.addIssue({
          code: "custom",
          path: ["components", index, "weight"],
          message: "启用项目权重必须大于 0",
        });
      }
      if (component.sourceType === null) {
        context.addIssue({
          code: "custom",
          path: ["components", index, "sourceType"],
          message: "启用项目必须确认成绩来源",
        });
      }
      const rates = component.mappings.map((item) => item.allocationRate);
      if (rates.length === 0 || rates.some((item) => item === null)) {
        context.addIssue({
          code: "custom",
          path: ["components", index, "mappings"],
          message: "启用项目必须完整填写课程目标分配比例",
        });
      } else {
        const total = rates.reduce<number>((sum, item) => sum + (item ?? 0), 0);
        if (Math.abs(total - 100) > 0.000001) {
          context.addIssue({
            code: "custom",
            path: ["components", index, "mappings"],
            message: "每个启用项目的课程目标分配比例合计必须为 100%",
          });
        }
      }
    });
    const totalWeight = enabled.reduce(
      (sum, item) => sum + (item.weight ?? 0),
      0,
    );
    if (Math.abs(totalWeight - 100) > 0.000001) {
      context.addIssue({
        code: "custom",
        path: ["components"],
        message: "启用考核项目权重合计必须严格为 100%",
      });
    }
  });

export const generateAssessmentSchemeSchema = z
  .object({ force: z.boolean().default(false) })
  .strict();

export const saveAssessmentSchemeSchema = z
  .object({
    expectedRevisionNumber: z.number().int().positive(),
    structure: assessmentSchemeStructureSchema,
  })
  .strict();

export const publishAssessmentSchemeSchema = z
  .object({ reviewRevisionId: z.string().cuid("审核修订 ID 格式无效") })
  .strict();

export type AssessmentSchemeStructure = z.output<
  typeof assessmentSchemeStructureSchema
>;
export type SaveAssessmentSchemeInput = z.output<
  typeof saveAssessmentSchemeSchema
>;
