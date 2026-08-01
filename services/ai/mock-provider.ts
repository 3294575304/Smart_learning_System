import { generateRuleBasedAnalysis } from "@/services/ai/fallback";
import type { AIProvider, AIProviderOptions } from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";
import type {
  SyllabusParseInput,
  SyllabusParseOutput,
} from "@/services/syllabus-parsing/schemas";

export type MockAIResponder = (
  input: StudentAnalysisInput,
  options: AIProviderOptions,
) => unknown | Promise<unknown>;

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  readonly model: string;

  constructor(
    private readonly responder: MockAIResponder = generateRuleBasedAnalysis,
    model = "mock-student-analyzer-v1",
  ) {
    this.model = model;
  }

  async analyzeStudentPerformance(
    input: StudentAnalysisInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted) {
      throw new DOMException("AI request aborted", "AbortError");
    }
    return this.responder(input, options);
  }

  async parseSyllabus(
    input: SyllabusParseInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted) {
      throw new DOMException("AI request aborted", "AbortError");
    }
    const output: SyllabusParseOutput = {
      courseInfo: {
        courseName: input.courseHint.name,
        courseCode: input.courseHint.courseNo,
        credits: null,
        totalHours: null,
        theoryHours: null,
        practiceHours: null,
        description: "Python 程序设计课程基础信息。",
        sourceRefs: [
          { page: input.pages[0]?.pageNumber ?? 1, verified: false },
        ],
      },
      objectives: [
        {
          code: "OBJ-1",
          title: "课程目标 1",
          description: "理解 Python 程序设计基础并能够解决基础问题。",
          sourceRefs: [
            { page: input.pages[0]?.pageNumber ?? 1, verified: false },
          ],
        },
      ],
      chapters: [
        {
          code: "CH-1",
          title: "Python 程序设计基础",
          description: "根据教学大纲文本形成的稳定 Mock 章节。",
          suggestedHours: null,
          order: 1,
          sourceRefs: [
            { page: input.pages[0]?.pageNumber ?? 1, verified: false },
          ],
          knowledgePoints: [
            {
              code: "KP-1",
              name: "Python 基础语法",
              description: null,
              importance: "CORE",
              sourceRefs: [
                { page: input.pages[0]?.pageNumber ?? 1, verified: false },
              ],
            },
          ],
        },
      ],
      prerequisites: [],
      keyTopics: [],
      difficultTopics: [],
      assessments: [],
      objectiveAssessmentMappings: [],
      materials: [],
      warnings: ["Mock Provider 仅用于本地开发和自动化测试。"],
    };
    return output;
  }
}
