import { z } from "zod";

const nullableText = z.string().trim().min(1).max(4_000).nullable();
const nullableNumber = z.number().finite().nonnegative().nullable();
const optionalMetadataText = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .nullable()
  .optional();
const codeSchema = z.string().trim().min(1).max(100);
const nameSchema = z.string().trim().min(1).max(300);

export const syllabusSourceRefSchema = z
  .object({
    page: z.number().int().positive(),
    quote: z.string().trim().min(1).max(500).optional(),
    verified: z.boolean().default(false),
  })
  .strict();

const sourceRefsSchema = z.array(syllabusSourceRefSchema).max(20).default([]);

export const syllabusCourseInfoV1Schema = z
  .object({
    courseName: z.string().trim().min(1).max(200).nullable(),
    courseCode: z.string().trim().min(1).max(100).nullable(),
    credits: nullableNumber,
    totalHours: nullableNumber,
    theoryHours: nullableNumber,
    practiceHours: nullableNumber,
  })
  .strict();

const syllabusObjectiveV1Schema = z
  .object({
    code: codeSchema,
    title: nameSchema,
    description: z.string().trim().min(1).max(6_000),
  })
  .strict();

const syllabusKnowledgePointV1Schema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    description: nullableText,
    importance: z.enum(["CORE", "NORMAL", "EXTENDED"]),
  })
  .strict();

const syllabusChapterV1Schema = z
  .object({
    code: codeSchema,
    title: nameSchema,
    description: nullableText,
    suggestedHours: nullableNumber,
    order: z.number().int().positive(),
    knowledgePoints: z.array(syllabusKnowledgePointV1Schema).max(300),
  })
  .strict();

const syllabusAssessmentV1Schema = z
  .object({
    name: nameSchema,
    type: z.string().trim().min(1).max(100),
    weight: z.number().finite().min(0).max(100).nullable(),
    description: nullableText,
  })
  .strict();

export const syllabusParseOutputV1Schema = z
  .object({
    courseInfo: syllabusCourseInfoV1Schema,
    objectives: z.array(syllabusObjectiveV1Schema).max(100),
    chapters: z.array(syllabusChapterV1Schema).max(200),
    assessments: z.array(syllabusAssessmentV1Schema).max(100),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
  })
  .strict();

const sourced = {
  sourceRefs: sourceRefsSchema,
};

export const syllabusCourseInfoSchema = z
  .object({
    courseName: z.string().trim().min(1).max(100).nullable(),
    courseCode: z.string().trim().min(1).max(50).nullable(),
    description: z.string().trim().min(1).max(6_000).nullable(),
    credits: nullableNumber,
    totalHours: nullableNumber,
    theoryHours: nullableNumber,
    practiceHours: nullableNumber,
    courseCategory: optionalMetadataText,
    courseNature: optionalMetadataText,
    teachingLanguage: optionalMetadataText,
    offeredTerm: optionalMetadataText,
    applicableMajors: optionalMetadataText,
    teachingCollege: optionalMetadataText,
    ...sourced,
  })
  .strict();

const syllabusObjectiveSchema = z
  .object({
    code: codeSchema,
    title: nameSchema,
    description: z.string().trim().min(1).max(6_000),
    ...sourced,
  })
  .strict();

const syllabusKnowledgePointSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    description: nullableText,
    importance: z.enum(["CORE", "NORMAL", "EXTENDED"]),
    ...sourced,
  })
  .strict();

const syllabusChapterSchema = z
  .object({
    code: codeSchema,
    title: nameSchema,
    description: nullableText,
    suggestedHours: nullableNumber,
    order: z.number().int().positive(),
    knowledgePoints: z.array(syllabusKnowledgePointSchema).max(300),
    ...sourced,
  })
  .strict();

const syllabusPracticeItemSchema = z
  .object({
    code: codeSchema,
    title: nameSchema,
    description: nullableText,
    suggestedHours: nullableNumber,
    relatedChapterCodes: z.array(codeSchema).max(100),
    ...sourced,
  })
  .strict();

const syllabusPrerequisiteSchema = z
  .object({
    fromKnowledgePointCode: codeSchema,
    toKnowledgePointCode: codeSchema,
    description: nullableText,
    ...sourced,
  })
  .strict();

const syllabusTopicSchema = z
  .object({
    knowledgePointCode: codeSchema.nullable(),
    name: nameSchema,
    description: nullableText,
    ...sourced,
  })
  .strict();

const syllabusAssessmentSchema = z
  .object({
    code: codeSchema,
    name: nameSchema,
    type: z.string().trim().min(1).max(100),
    weight: z.number().finite().min(0).max(100).nullable(),
    description: nullableText,
    ...sourced,
  })
  .strict();

const objectiveAssessmentMappingSchema = z
  .object({
    objectiveCode: codeSchema,
    assessmentCode: codeSchema,
    ...sourced,
  })
  .strict();

const syllabusMaterialSchema = z
  .object({
    code: codeSchema,
    title: nameSchema,
    type: z.enum(["TEXTBOOK", "REFERENCE", "OTHER"]),
    author: z.string().trim().min(1).max(300).nullable(),
    publisher: z.string().trim().min(1).max(300).nullable(),
    required: z.boolean(),
    ...sourced,
  })
  .strict();

function addDuplicateIssue(
  values: Array<string | number>,
  path: Array<string | number>,
  message: string,
  context: z.RefinementCtx,
) {
  if (new Set(values).size !== values.length) {
    context.addIssue({ code: "custom", path, message });
  }
}

export const syllabusParseOutputSchema = z
  .object({
    courseInfo: syllabusCourseInfoSchema,
    objectives: z.array(syllabusObjectiveSchema).max(100),
    chapters: z.array(syllabusChapterSchema).max(200),
    practiceItems: z.array(syllabusPracticeItemSchema).max(200),
    prerequisites: z.array(syllabusPrerequisiteSchema).max(500),
    keyTopics: z.array(syllabusTopicSchema).max(300),
    difficultTopics: z.array(syllabusTopicSchema).max(300),
    assessments: z.array(syllabusAssessmentSchema).max(100),
    objectiveAssessmentMappings: z
      .array(objectiveAssessmentMappingSchema)
      .max(500),
    materials: z.array(syllabusMaterialSchema).max(200),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    addDuplicateIssue(
      value.objectives.map((item) => item.code),
      ["objectives"],
      "课程目标编码不能重复",
      context,
    );
    addDuplicateIssue(
      value.chapters.map((item) => item.code),
      ["chapters"],
      "章节编码不能重复",
      context,
    );
    addDuplicateIssue(
      value.chapters.map((item) => item.order),
      ["chapters"],
      "章节顺序不能重复",
      context,
    );
    addDuplicateIssue(
      value.practiceItems.map((item) => item.code),
      ["practiceItems"],
      "实践项目编码不能重复",
      context,
    );
    addDuplicateIssue(
      value.chapters.flatMap((chapter) =>
        chapter.knowledgePoints.map((point) => point.code),
      ),
      ["chapters"],
      "知识点编码在当前结构中不能重复",
      context,
    );
    addDuplicateIssue(
      value.assessments.map((item) => item.code),
      ["assessments"],
      "考核项目编码不能重复",
      context,
    );
    addDuplicateIssue(
      value.materials.map((item) => item.code),
      ["materials"],
      "教材与参考资料编码不能重复",
      context,
    );
    const chapterCodes = new Set(value.chapters.map((item) => item.code));
    value.practiceItems.forEach((item, itemIndex) => {
      item.relatedChapterCodes.forEach((chapterCode, chapterIndex) => {
        if (!chapterCodes.has(chapterCode)) {
          context.addIssue({
            code: "custom",
            path: [
              "practiceItems",
              itemIndex,
              "relatedChapterCodes",
              chapterIndex,
            ],
            message: "实践项目关联的章节编码不存在",
          });
        }
      });
    });
  });

export const publishableSyllabusStructureSchema =
  syllabusParseOutputSchema.superRefine((value, context) => {
    if (!value.courseInfo.courseName) {
      context.addIssue({
        code: "custom",
        path: ["courseInfo", "courseName"],
        message: "课程名称不能为空",
      });
    }
    if (!value.courseInfo.courseCode) {
      context.addIssue({
        code: "custom",
        path: ["courseInfo", "courseCode"],
        message: "课程代码不能为空",
      });
    }
    if (value.objectives.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["objectives"],
        message: "至少需要一个课程目标",
      });
    }
    if (value.chapters.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["chapters"],
        message: "至少需要一个章节",
      });
    }
    value.chapters.forEach((chapter, index) => {
      if (chapter.knowledgePoints.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["chapters", index, "knowledgePoints"],
          message: "每个章节至少需要一个知识点",
        });
      }
    });
    const objectiveCodes = new Set(value.objectives.map((item) => item.code));
    const knowledgeCodes = new Set(
      value.chapters.flatMap((chapter) =>
        chapter.knowledgePoints.map((item) => item.code),
      ),
    );
    const assessmentCodes = new Set(value.assessments.map((item) => item.code));
    value.prerequisites.forEach((item, index) => {
      if (!knowledgeCodes.has(item.fromKnowledgePointCode)) {
        context.addIssue({
          code: "custom",
          path: ["prerequisites", index, "fromKnowledgePointCode"],
          message: "先修关系引用了不存在的知识点",
        });
      }
      if (!knowledgeCodes.has(item.toKnowledgePointCode)) {
        context.addIssue({
          code: "custom",
          path: ["prerequisites", index, "toKnowledgePointCode"],
          message: "先修关系引用了不存在的知识点",
        });
      }
    });
    [...value.keyTopics, ...value.difficultTopics].forEach((item, index) => {
      if (
        item.knowledgePointCode &&
        !knowledgeCodes.has(item.knowledgePointCode)
      ) {
        context.addIssue({
          code: "custom",
          path: ["keyTopics", index, "knowledgePointCode"],
          message: "重点或难点引用了不存在的知识点",
        });
      }
    });
    value.objectiveAssessmentMappings.forEach((item, index) => {
      if (!objectiveCodes.has(item.objectiveCode)) {
        context.addIssue({
          code: "custom",
          path: ["objectiveAssessmentMappings", index, "objectiveCode"],
          message: "映射引用了不存在的课程目标",
        });
      }
      if (!assessmentCodes.has(item.assessmentCode)) {
        context.addIssue({
          code: "custom",
          path: ["objectiveAssessmentMappings", index, "assessmentCode"],
          message: "映射引用了不存在的考核项目",
        });
      }
    });
    if (value.assessments.length > 0) {
      if (value.assessments.some((item) => item.weight === null)) {
        context.addIssue({
          code: "custom",
          path: ["assessments"],
          message: "发布考核方案时所有考核项目必须填写权重",
        });
      } else {
        const total = value.assessments.reduce(
          (sum, item) => sum + (item.weight ?? 0),
          0,
        );
        if (Math.abs(total - 100) > 0.000001) {
          context.addIssue({
            code: "custom",
            path: ["assessments"],
            message: "考核项目权重合计必须严格为 100%",
          });
        }
      }
    }
  });

function withLegacyPracticeItems(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !Object.prototype.hasOwnProperty.call(value, "practiceItems")
  ) {
    return { ...value, practiceItems: [] };
  }
  return value;
}

export const storedSyllabusParseOutputSchema = z.preprocess(
  withLegacyPracticeItems,
  syllabusParseOutputSchema,
);

export const storedPublishableSyllabusStructureSchema = z.preprocess(
  withLegacyPracticeItems,
  publishableSyllabusStructureSchema,
);

export const saveSyllabusReviewSchema = z
  .object({
    expectedRevisionNumber: z.number().int().nonnegative(),
    structure: syllabusParseOutputSchema,
  })
  .strict();

export const publishSyllabusReviewSchema = z
  .object({ reviewRevisionId: z.string().cuid("审核修订 ID 格式无效") })
  .strict();

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
export type SyllabusParseOutputV1 = z.output<
  typeof syllabusParseOutputV1Schema
>;
export type SaveSyllabusReviewInput = z.output<typeof saveSyllabusReviewSchema>;
