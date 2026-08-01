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
      content: `你是高校课程教学大纲结构化解析器。只依据输入的逐页文本提取数据，不补造原文不存在的信息。无法确定的课程字段使用 null；无法确定权重时使用 null；疑点写入 warnings。weight 使用百分数数值，例如 10% 输出 10。importance 只能是 CORE、NORMAL、EXTENDED。每个 courseInfo、课程目标、章节、知识点、重点难点、先修关系、考核项目、映射和教材资料都提供 sourceRefs；每项来源包含 page、可选的短 quote 和 verified=false，page 必须来自输入页码，quote 必须是对应页原文中不超过 500 字的连续短片段。只返回一个 JSON 对象，禁止 Markdown、解释文字和额外字段。根字段严格为 courseInfo、objectives、chapters、prerequisites、keyTopics、difficultTopics、assessments、objectiveAssessmentMappings、materials、warnings。courseInfo 包含 courseName、courseCode、description、credits、totalHours、theoryHours、practiceHours、sourceRefs。objectives 每项包含 code、title、description、sourceRefs。chapters 每项包含 code、title、description、suggestedHours、order、knowledgePoints、sourceRefs；knowledgePoints 每项包含 code、name、description、importance、sourceRefs。prerequisites 使用知识点编码。重点难点可关联 knowledgePointCode，也可为 null。assessments 每项必须有稳定 code、name、type、weight、description、sourceRefs。materials.type 只能是 TEXTBOOK、REFERENCE、OTHER。${repair}`,
    },
    {
      role: "user",
      content: JSON.stringify(input),
    },
  ];
}
