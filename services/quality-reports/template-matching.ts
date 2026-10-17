import {
  reportTemplateFields,
  validateTemplateMappings,
  type TemplateManifest,
  type TemplateSelection,
} from "./template-schema";

const normalize = (value: string) =>
  value
    .replace(/（位置 \d+）$/, "")
    .replace(/[\s、，,：:（）()_\-]/g, "")
    .toLowerCase();
const aliases: Record<string, keyof typeof reportTemplateFields> = {
  总评成绩构成: "gradeComposition",
  课程总评成绩构成: "gradeComposition",
  成绩构成及权重: "gradeComposition",
  课程名称: "courseName",
  学年学期: "term",
  任课教师: "teacherName",
  授课班级: "classroomName",
  平均成绩: "mean",
  成绩分布情况: "gradeDistribution",
  持续改进措施: "improvementMeasures",
  课程目标达成分析: "outcomeAnalysis",
  学生评价概括: "studentEvaluation",
};
const blankLabels = new Set(
  [
    "签名",
    "签字",
    "日期",
    "审核日期",
    "审批日期",
    "审批意见",
    "审核意见",
    "学院意见",
    "课程评价小组意见",
  ].map(normalize),
);
export function suggestTemplateMappings(
  manifest: TemplateManifest,
): Record<string, string> {
  return Object.fromEntries(
    manifest.slots.map((slot) => {
      const name = normalize(slot.label);
      const exact = Object.entries(reportTemplateFields).find(
        ([key, label]) => normalize(key) === name || normalize(label) === name,
      )?.[0];
      const alias = Object.entries(aliases).find(
        ([label]) => normalize(label) === name,
      )?.[1];
      return [
        slot.id,
        blankLabels.has(name) ? "BLANK" : (exact ?? alias ?? ""),
      ];
    }),
  );
}
export function getTemplateSelection(
  id: string,
  manifest: TemplateManifest,
  values: Record<string, string>,
): TemplateSelection {
  const mappings = Object.entries(values)
    .filter(([, field]) => field)
    .map(([slotId, field]) => ({ slotId, field }));
  try {
    validateTemplateMappings(manifest, mappings);
  } catch {
    return { templateFileVersionId: id, templateMappingConfirmed: false };
  }
  return {
    templateFileVersionId: id,
    templateMappingConfirmed: true,
    templateMappings: mappings,
  };
}
