import { z } from "zod";

export const reportTemplateFields = {
  courseName: "课程名称",
  courseNo: "课程号",
  term: "学期",
  teacherName: "授课教师",
  courseNature: "课程性质",
  credits: "学分",
  majorClass: "专业年级班级",
  college: "学院",
  major: "专业",
  classroomName: "教学班",
  participantCount: "有效成绩人数",
  excludedCount: "特殊状态人数",
  mean: "平均分",
  passRate: "及格率",
  excellentRate: "优秀率",
  gradeComposition: "成绩构成",
  gradeDistribution: "成绩分布",
  outcomeSummary: "课程目标达成度",
  attendanceSummary: "出勤汇总",
  surveySummary: "问卷汇总",
  gradeAnalysis: "成绩分析",
  outcomeAnalysis: "目标达成分析",
  outcomeDetails: "各目标分析",
  studentEvaluation: "学生评价",
  courseSummary: "课程总结",
  improvementMeasures: "改进措施",
} as const;
export const templateMappingSchema = z
  .object({
    slotId: z.string().min(1).max(200),
    field: z
      .string()
      .refine(
        (value) =>
          value === "BLANK" || Object.hasOwn(reportTemplateFields, value),
        "请选择有效报告字段",
      ),
  })
  .strict();
export const templateSelectionShape = {
  templateFileVersionId: z.string().cuid().optional(),
  templateMappingConfirmed: z.boolean().optional(),
  templateMappings: z.array(templateMappingSchema).max(200).optional(),
};
export const templateSnapshotSchema = z
  .object({
    fileVersionId: z.string().cuid(),
    name: z.string().max(255),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
    mappings: z.array(templateMappingSchema).min(1).max(200),
  })
  .strict();
export const templateManifestSchema = z
  .object({
    slots: z
      .array(
        z
          .object({
            id: z.string().max(200),
            label: z.string().max(300),
            kind: z.enum(["TOKEN", "CELL"]),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export type TemplateSelection = {
  templateFileVersionId?: string;
  templateMappingConfirmed?: boolean;
  templateMappings?: z.infer<typeof templateMappingSchema>[];
};
export type TemplateSnapshot = z.infer<typeof templateSnapshotSchema>;
export type TemplateManifest = z.infer<typeof templateManifestSchema>;

export function validateTemplateMappings(
  manifest: TemplateManifest,
  mappings: TemplateSnapshot["mappings"],
) {
  const ids = new Set<string>();
  for (const mapping of mappings) {
    if (
      !templateMappingSchema.safeParse(mapping).success ||
      ids.has(mapping.slotId) ||
      !manifest.slots.some((slot) => slot.id === mapping.slotId)
    )
      throw new Error("模板填写位置重复或已失效，请重新核对字段对应关系。");
    ids.add(mapping.slotId);
  }
  if (manifest.slots.some((slot) => slot.kind === "TOKEN" && !ids.has(slot.id)))
    throw new Error("请为每个占位符选择报告字段，或明确选择留空。");
  if (!mappings.some((mapping) => mapping.field !== "BLANK"))
    throw new Error("至少需要关联一个报告字段。");
}
