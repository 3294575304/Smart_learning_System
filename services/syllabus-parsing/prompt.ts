import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";

export function buildSyllabusParseMessages(
  input: SyllabusParseInput,
  validationError?: string,
): Array<{ role: "system" | "user"; content: string }> {
  const repair = validationError
    ? `\n上一次输出未通过校验：${validationError.slice(0, 1_000)}。修正后只返回完整 JSON。`
    : "";
  return [
    {
      role: "system",
      content: `你是高校课程教学大纲结构化解析器。只依据输入的逐页文本提取数据，不补造原文不存在的信息。无法确定的课程字段使用 null；无法确定权重时使用 null；疑点写入 warnings。weight 使用百分数数值，例如 10% 输出 10。importance 只能是 CORE、NORMAL、EXTENDED。只返回一个 JSON 对象，禁止 Markdown、解释文字和额外字段。根字段必须严格为 courseInfo、objectives、chapters、assessments、warnings。courseInfo 必须包含 courseName、courseCode、credits、totalHours、theoryHours、practiceHours。objectives 每项包含 code、title、description。chapters 每项包含 code、title、description、suggestedHours、order、knowledgePoints；knowledgePoints 每项包含 code、name、description、importance。assessments 每项包含 name、type、weight、description。${repair}`,
    },
    {
      role: "user",
      content: JSON.stringify(input),
    },
  ];
}
