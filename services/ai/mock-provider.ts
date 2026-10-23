import { generateRuleBasedAnalysis } from "@/services/ai/fallback";
import type { AIProvider, AIProviderOptions } from "@/services/ai/provider";
import type { StudentAnalysisInput } from "@/services/ai/schemas";
import type {
  SyllabusParseInput,
  SyllabusParseOutput,
} from "@/services/syllabus-parsing/schemas";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";
import type { QuestionMappingAIInput } from "@/services/question-mapping/schemas";
import { localQuestionConceptCandidates } from "@/services/question-mapping/candidates";
import type { SelfReflectionAIInput } from "@/services/self-reflections/schemas";
import type {
  QuestionGenerationAIInput,
  QuestionGenerationReviewInput,
} from "@/services/ai-question-generation/schemas";
import { QuestionType } from "@prisma/client";

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
    const sourcePage = input.pages[0]?.pageNumber ?? 1;
    const sourceText =
      input.pages[0]?.text.replace(/\s+/gu, " ").trim().slice(0, 1_000) ||
      "Python 程序设计";
    const output: SyllabusParseOutput = {
      courseInfo: {
        courseName: input.courseHint.name,
        courseCode: input.courseHint.courseNo,
        credits: null,
        totalHours: null,
        theoryHours: null,
        practiceHours: null,
        courseCategory: null,
        courseNature: null,
        teachingLanguage: null,
        offeredTerm: null,
        applicableMajors: null,
        teachingCollege: null,
        description: "Python 程序设计课程基础信息。",
        sourceRefs: [{ page: sourcePage, verified: false }],
      },
      objectives: [
        {
          code: "OBJ-1",
          title: "课程目标 1",
          description: sourceText,
          sourceRefs: [{ page: sourcePage, verified: false }],
        },
      ],
      chapters: [
        {
          code: "CH-1",
          title: "Python 程序设计基础",
          description: "根据教学大纲文本形成的稳定 Mock 章节。",
          suggestedHours: null,
          order: 1,
          sourceRefs: [{ page: sourcePage, verified: false }],
          knowledgePoints: [
            {
              code: "KP-1",
              name: "Python 基础语法",
              description: null,
              importance: "CORE",
              sourceRefs: [{ page: sourcePage, verified: false }],
            },
          ],
        },
      ],
      practiceItems: [],
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

  async inferKnowledgeGraphRelations(
    _input: KnowledgeGraphStructure,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted)
      throw new DOMException("AI request aborted", "AbortError");
    return { related: [] };
  }

  async mapQuestionsToConcepts(
    input: QuestionMappingAIInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted) {
      throw new DOMException("AI request aborted", "AbortError");
    }
    return {
      mappings: input.questions.map((question) => ({
        questionId: question.id,
        candidates: localQuestionConceptCandidates(
          {
            title: question.title,
            content: question.content,
            tags: question.tags,
          },
          input.concepts.map((concept) => ({
            id: concept.id,
            conceptId: concept.id,
            code: concept.code,
            name: concept.name,
            description: concept.description,
          })),
        ).map((candidate) => ({
          conceptId: candidate.conceptId,
          confidence: candidate.confidence,
          reason: candidate.reason,
        })),
      })),
    };
  }

  async generateQuestions(
    input: QuestionGenerationAIInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted)
      throw new DOMException("AI request aborted", "AbortError");
    const sourceIds = [input.evidence[0]?.id ?? "MOCK"];
    return {
      questions: Array.from({ length: input.count }, (_, index) => {
        const number = input.sequence + index;
        const optionCount = input.optionCount ?? 0;
        const options = Array.from({ length: optionCount }, (__, position) => ({
          label: String.fromCharCode(65 + position),
          content: `示例选项 ${position + 1}`,
          sortOrder: position + 1,
        }));
        const answer =
          input.type === QuestionType.SINGLE_CHOICE
            ? { kind: "CHOICE", correctOptionLabels: ["A"] }
            : input.type === QuestionType.MULTIPLE_CHOICE
              ? { kind: "CHOICE", correctOptionLabels: ["A", "B"] }
              : input.type === QuestionType.TRUE_FALSE
                ? { kind: "BOOLEAN", value: true }
                : input.type === QuestionType.FILL_BLANK
                  ? {
                      kind: "TEXT",
                      acceptableAnswers: ["Python"],
                      caseSensitive: false,
                    }
                  : input.type === QuestionType.SHORT_ANSWER
                    ? {
                        kind: "REFERENCE",
                        value: "说明关键概念与应用。",
                      }
                    : { kind: "PROGRAMMING" };
        return {
          question: {
            title: `Mock ${input.type} 示例 ${number}`,
            content: `请分析 Python ${input.type} 示例 ${number} 的运行结果。`,
            type: input.type,
            difficulty: input.difficulty,
            options,
            answer,
            explanation:
              "本题仅用于本地开发和自动化测试，不是正式 AI 生成结果。",
            tags: ["Mock 出题"],
          },
          programmingConfig:
            input.type === QuestionType.PYTHON_PROGRAMMING
              ? {
                  standardCode: "print(input())",
                  starterCode: "",
                  totalPoints: 10,
                  limits: {
                    cpuTimeMs: 1_000,
                    wallTimeMs: 2_000,
                    memoryBytes: 64 * 1024 * 1024,
                    outputBytes: 65_536,
                    processCount: 8,
                  },
                  testCases: [
                    {
                      visibility: "PUBLIC",
                      name: "样例",
                      stdin: "hello\n",
                      expectedOutput: "hello\n",
                      points: 5,
                      sortOrder: 1,
                    },
                    {
                      visibility: "HIDDEN",
                      name: "隐藏用例",
                      stdin: "world\n",
                      expectedOutput: "world\n",
                      points: 5,
                      sortOrder: 2,
                    },
                  ],
                }
              : null,
          sourceIds,
          primaryConceptId: input.concepts[0]?.id ?? null,
        };
      }),
    };
  }

  async reviewGeneratedQuestions(
    input: QuestionGenerationReviewInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted)
      throw new DOMException("AI request aborted", "AbortError");
    return {
      reviews: Array.from({ length: input.count }, (_, index) => ({
        index,
        factsSupported: true,
        answerConsistent: true,
        clear: true,
        difficultyAligned: true,
        reason: "Mock 审查，仅用于本地开发和自动化测试",
      })),
    };
  }

  async structureSelfReflection(
    input: SelfReflectionAIInput,
    options: AIProviderOptions,
  ): Promise<unknown> {
    if (options.signal.aborted)
      throw new DOMException("AI request aborted", "AbortError");
    const matched = input.concepts.filter(
      (concept) =>
        input.text.includes(concept.name) || input.text.includes(concept.code),
    );
    return {
      summary: input.text.slice(0, 500),
      goals: [],
      difficulties: matched.map((concept) => concept.name).slice(0, 10),
      learningHabits: [],
      practiceRequest: matched.length
        ? {
            conceptIds: matched.map((concept) => concept.id),
            questionTypes: [],
            count: 5,
            difficulty: 2,
          }
        : null,
    };
  }
}
