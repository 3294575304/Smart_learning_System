import type { StudentAnalysisInput } from "@/services/ai/schemas";

export function buildStudentAnalysisMessages(
  input: StudentAnalysisInput,
  validationError?: string,
): Array<{ role: "system" | "user"; content: string }> {
  const repairInstruction = validationError
    ? `\n上一次输出未通过校验：${validationError.slice(0, 800)}。请修正后只返回 JSON。`
    : "";

  return [
    {
      role: "system",
      content: `你是智能教学平台的学情分析器。只依据给定的匿名化数据分析，不推断学生身份。只返回一个 JSON 对象，禁止 Markdown 和额外文字。输出字段必须严格为 overallLevel、masteredKnowledgePoints、weakKnowledgePoints、errorPatterns、suggestions、recommendedDifficulty、confidence。overallLevel 只能是 BEGINNER、BASIC、INTERMEDIATE、ADVANCED；severity 和 recommendedDifficulty 必须是 1 到 5 的整数；confidence 必须是 0 到 1。证据不足时错误类型使用 UNKNOWN。${repairInstruction}`,
    },
    {
      role: "user",
      content: JSON.stringify(input),
    },
  ];
}
