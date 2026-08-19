import type { SyllabusParseInput } from "@/services/syllabus-parsing/schemas";

export function buildSyllabusParseMessages(
  input: SyllabusParseInput,
  validationError?: string,
): Array<{ role: "system" | "user"; content: string }> {
  const repair = validationError
    ? `上一次输出未通过校验：${validationError.slice(0, 1_000)}。修正后返回完整 JSON。`
    : "";
  return [
    {
      role: "system",
      content: `你是高校课程教学大纲结构化解析器。只依据输入的逐页文本提取，不补造信息。只返回一个紧凑的单行 JSON 对象，禁止 Markdown、解释、缩进和额外字段。

严格按下列对象形状输出，所有列出的键都必须存在：
courseInfo={courseName:string|null,courseCode:string|null,description:string|null,credits:number|null,totalHours:number|null,theoryHours:number|null,practiceHours:number|null,courseCategory:string|null,courseNature:string|null,teachingLanguage:string|null,offeredTerm:string|null,applicableMajors:string|null,teachingCollege:string|null,sourceRefs:Ref[]}。其中 courseCategory 提取“课程类别”，courseNature 提取“课程性质”，applicableMajors 提取“适用专业”，teachingCollege 提取“授课学院”；表格中字段存在时不得遗漏。
objectives=Objective[]，Objective={code:string,title:string,description:string,sourceRefs:Ref[]}；description 不允许 null，使用原文课程目标的简短描述。
chapters=Chapter[]，Chapter={code:string,title:string,description:string|null,suggestedHours:number|null,order:正整数,knowledgePoints:KnowledgePoint[],sourceRefs:Ref[]}。
KnowledgePoint={code:string,name:string,description:string|null,importance:"CORE"|"NORMAL"|"EXTENDED",sourceRefs:Ref[]}。
practiceItems=PracticeItem[]，PracticeItem={code:string,title:string,description:string|null,suggestedHours:number|null,relatedChapterCodes:string[],sourceRefs:Ref[]}；实验、实训或课程设计项目必须单独提取，不得混入理论章节。
prerequisites=Prerequisite[]，Prerequisite={fromKnowledgePointCode:string,toKnowledgePointCode:string,description:string|null,sourceRefs:Ref[]}。
keyTopics 和 difficultTopics 均为 Topic[]，Topic={knowledgePointCode:string|null,name:string,description:string|null,sourceRefs:Ref[]}。
assessments=Assessment[]，Assessment={code:string,name:string,type:string,weight:number|null,description:string|null,sourceRefs:Ref[]}。
objectiveAssessmentMappings=Mapping[]，Mapping={objectiveCode:string,assessmentCode:string,allocationRate:number|null,sourceRefs:Ref[]}；allocationRate 是“该课程目标在该考核方式中占比”的百分数值。若原文存在二维占比表，必须逐单元格完整提取（包括 0），不得只输出是否关联。
materials=Material[]，Material={code:string,title:string,type:"TEXTBOOK"|"REFERENCE"|"OTHER",author:string|null,publisher:string|null,required:boolean,sourceRefs:Ref[]}。
warnings=string[]。Ref={page:正整数,verified:false}，仅在必要时增加 quote:string。

压缩规则必须遵守：
1. 每个 sourceRefs 默认只输出一个最直接来源：[{"page":页码,"verified":false}]。不要输出 quote；只有页码无法区分来源时才添加不超过 30 字的 quote。
2. description 只写原文要点短摘要：课程描述不超过 120 字，其余 description 不超过 60 字；只有上述标明 string|null 的字段才允许 null。
3. 不要在 description、warnings 或不同知识点中重复大段原文。
4. 章节和知识点按大纲实际层级提取，不把每个教学要求句拆成独立知识点。
5. 无法确定的课程字段和权重用 null；不得用 0 代替缺失学分；weight 使用百分数值，如 10% 输出 10。
6. importance 只能是 CORE、NORMAL、EXTENDED。
7. 稳定编码使用 OBJ-1、CH-1、KP-1-1、ASSESS-1 等短格式。
8. 所有引用编码必须真实存在：映射引用 objectives/assessments 的 code，先修和 Topic 引用 knowledgePoints 的 code，practiceItems.relatedChapterCodes 引用 chapters 的 code。
9. 同类 code 和章节 order 不得重复。JSON 必须完整闭合，完整性优先于补充细节。
10. 课程目标—考核方式占比表按课程目标行、考核方式列读取；每种考核方式下所有课程目标的 allocationRate 合计必须为 100。无法确定具体数值时用 null，不得把各考核方式占总成绩权重误填为 allocationRate。${repair}`,
    },
    {
      role: "user",
      content: JSON.stringify(input),
    },
  ];
}
