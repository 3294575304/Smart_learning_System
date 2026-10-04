export const ANALYSIS_LABELS: Record<string, string> = {
  UNKNOWN: "暂未确定",
  CONCEPT: "概念理解偏差",
  CALCULATION: "计算错误",
  CARELESS: "审题或操作疏漏",
  METHOD: "解题方法不当",
  BEGINNER: "基础待加强",
  BASIC: "具备基础",
  INTERMEDIATE: "掌握较好",
  ADVANCED: "掌握熟练",
};
export function analysisKnowledgePointIds(texts: Array<string | null>) {
  return [
    ...new Set(
      texts.flatMap((text) => text?.match(/\bc[a-z0-9]{20,}\b/g) ?? []),
    ),
  ];
}
export function presentAnalysisText(
  text: string,
  names: ReadonlyMap<string, string>,
) {
  return text
    .replace(/\bc[a-z0-9]{20,}\b/g, (id) => names.get(id) ?? "相关知识点")
    .replace(
      /\b(UNKNOWN|CONCEPT|CALCULATION|CARELESS|METHOD|BEGINNER|BASIC|INTERMEDIATE|ADVANCED)\b/g,
      (code) => ANALYSIS_LABELS[code] ?? code,
    );
}
