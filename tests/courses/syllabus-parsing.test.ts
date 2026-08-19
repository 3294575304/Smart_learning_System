import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  AIProviderRequestError,
  type AIProvider,
  type AIProviderOptions,
} from "@/services/ai/provider";
import {
  MAX_SYLLABUS_MAX_COMPLETION_TOKENS,
  parseSyllabusMaxCompletionTokens,
  resolveAIThinkingMode,
} from "@/services/ai/provider-config";
import { MockAIProvider } from "@/services/ai/mock-provider";
import { OpenAICompatibleProvider } from "@/services/ai/openai-compatible";
import {
  createTeacherCourse,
  listTeacherCourseTemplates,
  uploadTeacherCourseSyllabus,
  type CourseSyllabusUploadFile,
} from "@/services/courses/service";
import { LocalStorageService } from "@/services/storage/local-storage";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";
import { parseSyllabusStructure } from "@/services/syllabus-parsing/parser";
import { SyllabusParseOperationError } from "@/services/syllabus-parsing/errors";
import { markParseSucceeded } from "@/services/syllabus-parsing/repository";
import { buildSyllabusParseMessages } from "@/services/syllabus-parsing/prompt";
import {
  storedSyllabusParseOutputSchema,
  syllabusParseOutputSchema,
  type SyllabusParseInput,
  type SyllabusParseOutput,
} from "@/services/syllabus-parsing/schemas";
import {
  createTeacherSyllabusParse,
  getTeacherSyllabusParses,
} from "@/services/syllabus-parsing/service";

const prisma = new PrismaClient();
const auditContext = {
  ipAddress: "127.0.0.1",
  userAgent: "syllabus-parsing-test",
};

const validOutput: SyllabusParseOutput = {
  courseInfo: {
    courseName: "Python Programming",
    courseCode: "PY101",
    credits: 2,
    courseCategory: "专业课",
    courseNature: "必修",
    teachingLanguage: "中文",
    offeredTerm: "第 2 学期",
    applicableMajors: "计算机相关专业",
    teachingCollege: "计算机学院",
    totalHours: 32,
    theoryHours: 20,
    practiceHours: 12,
    description: "Python programming syllabus.",
    sourceRefs: [{ page: 1, verified: false }],
  },
  objectives: [
    {
      code: "OBJ-1",
      title: "Programming foundations",
      description: "Understand Python foundations.",
      sourceRefs: [{ page: 1, verified: false }],
    },
  ],
  chapters: [
    {
      code: "CH-1",
      title: "Introduction",
      description: null,
      suggestedHours: 2,
      order: 1,
      sourceRefs: [{ page: 1, verified: false }],
      knowledgePoints: [
        {
          code: "KP-1",
          name: "Basic syntax",
          description: null,
          importance: "CORE",
          sourceRefs: [{ page: 1, verified: false }],
        },
      ],
    },
  ],
  practiceItems: [],
  prerequisites: [],
  keyTopics: [],
  difficultTopics: [],
  assessments: [
    {
      code: "ASSESS-1",
      name: "Final examination",
      type: "EXAM",
      weight: 100,
      description: null,
      sourceRefs: [{ page: 1, verified: false }],
    },
  ],
  objectiveAssessmentMappings: [
    {
      objectiveCode: "OBJ-1",
      assessmentCode: "ASSESS-1",
      allocationRate: 100,
      sourceRefs: [{ page: 1, verified: false }],
    },
  ],
  materials: [],
  warnings: [],
};

async function textPdf(text = "Python Programming Syllabus PY101 32 hours") {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage();
  page.drawText(text, { x: 40, y: 760, font, size: 12 });
  return Buffer.from(await document.save());
}

function uploadFile(data: Buffer, name = "syllabus.pdf") {
  return {
    name,
    type: "application/pdf",
    size: data.length,
    arrayBuffer: async () => Uint8Array.from(data).buffer,
  } satisfies CourseSyllabusUploadFile;
}

function providerWith(
  responder: (
    input: SyllabusParseInput,
    options: AIProviderOptions,
  ) => unknown | Promise<unknown>,
): AIProvider {
  return {
    name: "syllabus-test",
    model: "syllabus-test-v1",
    analyzeStudentPerformance: async () => ({}),
    parseSyllabus: async (input, options) => responder(input, options),
  };
}

test("PDF extractor reads normal text and rejects invalid or empty PDFs", async () => {
  const extracted = await extractTextFromPdf(await textPdf());
  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.pages[0]?.text ?? "", /Python Programming/u);

  await assert.rejects(
    () => extractTextFromPdf(Buffer.from("not a pdf")),
    /不是合法 PDF/u,
  );
  await assert.rejects(
    () => extractTextFromPdf(Buffer.from("%PDF-1.7\nbroken")),
    /已损坏或无法读取/u,
  );
  const emptyDocument = await PDFDocument.create();
  emptyDocument.addPage();
  const emptyPdf = Buffer.from(await emptyDocument.save());
  await assert.rejects(() => extractTextFromPdf(emptyPdf), /没有可提取文本/u);
});

test(
  "用户上传的 2024 Python 教学大纲可完整提取并进入紧凑提示词",
  { skip: !process.env.SYLLABUS_ACCEPTANCE_PDF_PATH },
  async () => {
    const samplePath = process.env.SYLLABUS_ACCEPTANCE_PDF_PATH;
    assert.ok(samplePath);
    const extracted = await extractTextFromPdf(await fs.readFile(samplePath));
    assert.equal(extracted.pageCount, 11);
    assert.equal(extracted.pages.length, 11);
    assert.equal(extracted.characterCount, 8_643);
    assert.match(extracted.pages[1]?.text ?? "", /Python 程序设计/u);
    assert.match(extracted.pages[2]?.text ?? "", /课程目标/u);
    assert.match(extracted.pages[6]?.text ?? "", /课程实验/u);

    const messages = buildSyllabusParseMessages({
      courseHint: {
        name: "Python 程序设计",
        courseNo: "PYTHON-2024",
        term: "2026-2027-1",
      },
      pages: extracted.pages,
    });
    const sentInput = JSON.parse(messages[1]!.content) as SyllabusParseInput;
    assert.equal(sentInput.pages.length, 11);
    assert.equal(sentInput.pages.at(-1)?.pageNumber, 11);
    assert.match(messages[0]!.content, /完整性优先/u);
  },
);

test("strict AI JSON validation retries once and accepts a repaired output", async () => {
  const extracted = await extractTextFromPdf(await textPdf());
  let calls = 0;
  const provider = providerWith((_input, options) => {
    calls += 1;
    if (calls === 1) return "not-json";
    assert.ok(options.validationError);
    return validOutput;
  });
  const result = await parseSyllabusStructure(provider, {
    courseHint: {
      name: "Python Programming",
      courseNo: "PY101",
      term: "2026-2027-1",
    },
    pages: extracted.pages,
  });
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
  assert.deepEqual(result.output, validOutput);
});

test("2024 Python 固定样本验收结构覆盖目标、章节、实验、学时和考核权重", async () => {
  const expected = structuredClone(validOutput);
  expected.objectives = Array.from({ length: 3 }, (_, index) => ({
    code: "OBJ-" + (index + 1),
    title: ["知识", "能力", "素养"][index]!,
    description: "课程目标 " + (index + 1),
    sourceRefs: [{ page: 3, verified: false }],
  }));
  expected.chapters = Array.from({ length: 11 }, (_, index) => ({
    code: "CH-" + (index + 1),
    title: "第 " + (index + 1) + " 章",
    description: null,
    suggestedHours: index === 0 || index === 1 ? 1 : 2,
    order: index + 1,
    knowledgePoints: [
      {
        code: "KP-" + (index + 1) + "-1",
        name: "知识点 " + (index + 1),
        description: null,
        importance: "CORE" as const,
        sourceRefs: [
          { page: Math.min(6, 3 + Math.floor(index / 3)), verified: false },
        ],
      },
    ],
    sourceRefs: [
      { page: Math.min(6, 3 + Math.floor(index / 3)), verified: false },
    ],
  }));
  expected.practiceItems = Array.from({ length: 8 }, (_, index) => ({
    code: "EXP-" + (index + 1),
    title: "实验 " + (index + 1),
    description: null,
    suggestedHours: index < 4 ? 1 : 2,
    relatedChapterCodes: ["CH-" + Math.min(11, index + 2)],
    sourceRefs: [{ page: index < 6 ? 7 : 8, verified: false }],
  }));
  expected.assessments = [
    ["平时表现", 10],
    ["课程作业", 5],
    ["期中考试", 5],
    ["课程实验", 20],
    ["期末考试", 60],
  ].map(([name, weight], index) => ({
    code: "ASSESS-" + (index + 1),
    name: String(name),
    type: "COURSE_ASSESSMENT",
    weight: Number(weight),
    description: null,
    sourceRefs: [{ page: 9, verified: false }],
  }));
  expected.objectiveAssessmentMappings = [];
  const execution = await parseSyllabusStructure(
    providerWith(() => expected),
    {
      courseHint: {
        name: "Python 程序设计",
        courseNo: "PYTHON-2024",
        term: "2026-2027-1",
      },
      pages: Array.from({ length: 11 }, (_, index) => ({
        pageNumber: index + 1,
        text:
          index === 7
            ? "课程目标在各考核方式中占比 平时表现 课程作业 期中考试 课程实验 期末考试 目标1 50% 60% 60% 50% 60% 目标2 25% 20% 30% 25% 30%"
            : index === 8
              ? "目标3 25% 20% 10% 25% 10% 合计 100% 100% 100% 100% 100% 各考核方式占总成绩权重 10% 5% 5% 20% 60%"
              : "固定样本第 " + (index + 1) + " 页",
      })),
    },
  );

  assert.equal(execution.output.objectives.length, 3);
  assert.equal(execution.output.chapters.length, 11);
  assert.equal(
    execution.output.chapters.reduce(
      (sum, chapter) => sum + (chapter.suggestedHours ?? 0),
      0,
    ),
    20,
  );
  assert.equal(execution.output.practiceItems.length, 8);
  assert.equal(
    execution.output.practiceItems.reduce(
      (sum, item) => sum + (item.suggestedHours ?? 0),
      0,
    ),
    12,
  );
  assert.deepEqual(
    execution.output.assessments.map((item) => [item.name, item.weight]),
    [
      ["平时表现", 10],
      ["课程作业", 5],
      ["期中考试", 5],
      ["课程实验", 20],
      ["期末考试", 60],
    ],
  );
  assert.deepEqual(
    execution.output.objectiveAssessmentMappings.map(
      (item) => item.allocationRate,
    ),
    [50, 60, 60, 50, 60, 25, 20, 30, 25, 30, 25, 20, 10, 25, 10],
  );
  assert.equal(
    execution.output.objectiveAssessmentMappings.every(
      (item) => item.sourceRefs[0]?.page === 8,
    ),
    true,
  );
  assert.match(
    buildSyllabusParseMessages({
      courseHint: { name: "Python", courseNo: "PY", term: "2026-1" },
      pages: [{ pageNumber: 1, text: "实践教学内容" }],
    })[0]!.content,
    /practiceItems/u,
  );
});

test("v5 AI 输出必须显式包含实践项目且旧存量结构只读兼容", () => {
  const legacy = structuredClone(validOutput) as Record<string, unknown>;
  delete legacy.practiceItems;
  const mappings = legacy.objectiveAssessmentMappings as Array<
    Record<string, unknown>
  >;
  delete mappings[0]?.allocationRate;
  assert.equal(syllabusParseOutputSchema.safeParse(legacy).success, false);
  const stored = storedSyllabusParseOutputSchema.parse(legacy);
  assert.deepEqual(stored.practiceItems, []);
  assert.equal(stored.objectiveAssessmentMappings[0]?.allocationRate, null);
});

test("invalid JSON uses two repair retries and then reports INVALID_AI_JSON", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      parseSyllabusStructure(
        providerWith(() => {
          calls += 1;
          return "not-json";
        }),
        {
          courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
          pages: [{ pageNumber: 1, text: "Python syllabus" }],
        },
      ),
    (error: unknown) =>
      error instanceof SyllabusParseOperationError &&
      error.code === "INVALID_AI_JSON",
  );
  assert.equal(calls, 3);
});

test("provider returning before the deadline succeeds", async () => {
  let calls = 0;
  const result = await parseSyllabusStructure(
    providerWith(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return validOutput;
    }),
    {
      courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
      pages: [{ pageNumber: 1, text: "Python syllabus" }],
    },
    100,
  );
  assert.equal(calls, 1);
  assert.equal(result.retryCount, 0);
});

test("provider timeout aborts the request, calls once, and maps PROVIDER_TIMEOUT", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      parseSyllabusStructure(
        providerWith(
          (_input, options) =>
            new Promise((_resolve, reject) => {
              calls += 1;
              options.signal.addEventListener(
                "abort",
                () => reject(new DOMException("aborted", "AbortError")),
                { once: true },
              );
            }),
        ),
        {
          courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
          pages: [{ pageNumber: 1, text: "Python syllabus" }],
        },
        10,
      ),
    (error: unknown) =>
      error instanceof SyllabusParseOperationError &&
      error.code === "PROVIDER_TIMEOUT",
  );
  assert.equal(calls, 1);
});

test("schema failure uses two repair retries and ends as INVALID_AI_OUTPUT", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      parseSyllabusStructure(
        providerWith(() => {
          calls += 1;
          return { unexpected: true };
        }),
        {
          courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
          pages: [{ pageNumber: 1, text: "Python syllabus" }],
        },
      ),
    (error: unknown) =>
      error instanceof SyllabusParseOperationError &&
      error.code === "INVALID_AI_OUTPUT",
  );
  assert.equal(calls, 3);
});

test("provider empty content is retried once before failing the parse", async () => {
  let calls = 0;
  const result = await parseSyllabusStructure(
    providerWith(() => {
      calls += 1;
      if (calls === 1) {
        throw new AIProviderRequestError(
          "empty response",
          "PROVIDER_EMPTY_RESPONSE",
        );
      }
      return validOutput;
    }),
    {
      courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
      pages: [{ pageNumber: 1, text: "Python syllabus" }],
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
});

test("finish_reason length automatically retries once with a compact repair", async () => {
  let calls = 0;
  const result = await parseSyllabusStructure(
    providerWith((_input, options) => {
      calls += 1;
      if (calls === 2) {
        assert.match(options.validationError ?? "", /显著压缩/u);
        return validOutput;
      }
      return {
        content: "{}",
        requestId: "req-1",
        finishReason: "length",
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        responseLength: 2,
      };
    }),
    {
      courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
      pages: [{ pageNumber: 1, text: "Python syllabus" }],
    },
  );
  assert.equal(calls, 2);
  assert.equal(result.retryCount, 1);
});

test(
  "empty chat content with finish_reason length maps to AI_OUTPUT_TRUNCATED",
  { concurrency: false },
  async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: null, reasoning_content: "omitted" },
              finish_reason: "length",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 8192,
            total_tokens: 8202,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    try {
      const provider = new OpenAICompatibleProvider({
        apiKey: "test",
        baseUrl: "https://example.invalid/v1",
        model: "test",
      });
      await assert.rejects(
        () =>
          parseSyllabusStructure(provider, {
            courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
            pages: [{ pageNumber: 1, text: "Python syllabus" }],
          }),
        (error: unknown) =>
          error instanceof SyllabusParseOperationError &&
          error.code === "AI_OUTPUT_TRUNCATED",
      );
      assert.equal(calls, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

test("openai-compatible client has implicit retries disabled", () => {
  const provider = new OpenAICompatibleProvider({
    apiKey: "test",
    baseUrl: "https://example.invalid/v1",
    model: "test",
  });
  assert.equal(provider.maxRetries, 0);
});

test("syllabus request uses the quality-first 32768 completion-token default", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify(validOutput) },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      { status: 200 },
    );
  };
  try {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test",
      baseUrl: "https://example.invalid/v1",
      model: "test",
    });
    await provider.parseSyllabus(
      {
        courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
        pages: [{ pageNumber: 1, text: "Python syllabus" }],
      },
      { signal: new AbortController().signal },
    );
    assert.equal(requestBody?.max_tokens, 32_768);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test(
  "syllabus provider config honors 16384 tokens and disables DeepSeek thinking",
  { concurrency: false },
  async () => {
    assert.equal(parseSyllabusMaxCompletionTokens(undefined), 32_768);
    assert.equal(parseSyllabusMaxCompletionTokens("16384"), 16_384);
    assert.equal(
      parseSyllabusMaxCompletionTokens("999999"),
      MAX_SYLLABUS_MAX_COMPLETION_TOKENS,
    );
    assert.equal(
      resolveAIThinkingMode(undefined, "https://api.deepseek.com/v1"),
      "disabled",
    );
    assert.equal(
      resolveAIThinkingMode(undefined, "https://example.invalid/v1"),
      undefined,
    );

    const originalFetch = globalThis.fetch;
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify(validOutput) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200 },
      );
    };
    try {
      const provider = new OpenAICompatibleProvider({
        apiKey: "test",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        thinkingMode: "disabled",
        syllabusMaxCompletionTokens: 16_384,
      });
      await provider.parseSyllabus(
        {
          courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
          pages: [{ pageNumber: 1, text: "Python syllabus" }],
        },
        { signal: new AbortController().signal },
      );
      assert.equal(requestBody?.max_tokens, 16_384);
      assert.deepEqual(requestBody?.thinking, { type: "disabled" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
);

test("syllabus prompt requires compact page-only references by default", () => {
  const messages = buildSyllabusParseMessages({
    courseHint: { name: "Python", courseNo: "PY101", term: "2026" },
    pages: [{ pageNumber: 1, text: "Python syllabus" }],
  });
  assert.match(messages[0]?.content ?? "", /紧凑的单行 JSON/u);
  assert.match(messages[0]?.content ?? "", /不要输出 quote/u);
  assert.match(messages[0]?.content ?? "", /完整性优先/u);
  assert.match(messages[0]?.content ?? "", /allocationRate/u);
  assert.match(messages[0]?.content ?? "", /合计必须为 100/u);
});

test("terminal writes use attemptId so a late result cannot overwrite a newer attempt", async () => {
  let where: unknown;
  const client = {
    syllabusParseDraft: {
      updateMany: async (input: { where: unknown }) => {
        where = input.where;
        return { count: 0 };
      },
    },
  };
  const result = await markParseSucceeded(
    "draft-1",
    "old-attempt",
    {
      provider: "test",
      model: "test",
      retryCount: 0,
      completedAt: new Date(),
      structuredResult: {},
      extractedTextMetadata: {},
    },
    client as never,
  );
  assert.equal(result.count, 0);
  assert.deepEqual(where, {
    id: "draft-1",
    attemptId: "old-attempt",
    status: "PROCESSING",
  });
});

test("three invalid AI outputs fail without creating a fabricated fallback", async () => {
  const extracted = await extractTextFromPdf(await textPdf());
  let calls = 0;
  await assert.rejects(
    () =>
      parseSyllabusStructure(
        providerWith(() => {
          calls += 1;
          return { unexpected: true };
        }),
        {
          courseHint: {
            name: "Python Programming",
            courseNo: "PY101",
            term: "2026-2027-1",
          },
          pages: extracted.pages,
        },
      ),
    /结构化解析失败/u,
  );
  assert.equal(calls, 3);
});

test("Mock Provider returns a stable schema-valid syllabus draft", async () => {
  const extracted = await extractTextFromPdf(await textPdf());
  const input: SyllabusParseInput = {
    courseHint: {
      name: "Python Programming",
      courseNo: "PY101",
      term: "2026-2027-1",
    },
    pages: extracted.pages,
  };
  const provider = new MockAIProvider();
  const first = await parseSyllabusStructure(provider, input);
  const second = await parseSyllabusStructure(provider, input);
  assert.deepEqual(first.output, second.output);
});

test("parse drafts are version-isolated, idempotent and preserve existing data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhixue-parse-"));
  const previousRoot = process.env.LOCAL_UPLOAD_ROOT;
  process.env.LOCAL_UPLOAD_ROOT = root;
  const createdCourseIds: string[] = [];
  try {
    const [teacher, teacherTwo, template] = await Promise.all([
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher@example.com" },
        select: { id: true },
      }),
      prisma.user.findUniqueOrThrow({
        where: { email: "teacher2@example.com" },
        select: { id: true },
      }),
      listTeacherCourseTemplates().then((items) =>
        items.find((item) => item.code === "python-programming-v1"),
      ),
    ]);
    assert.ok(template);
    const suffix = randomBytes(4).toString("hex");
    const course = await createTeacherCourse(
      teacher.id,
      {
        templateId: template.id,
        courseNo: `PARSE-${suffix}`,
        term: "2026-2027-1",
        name: "Python Programming",
        description: null,
      },
      auditContext,
    );
    createdCourseIds.push(course.id);

    await assert.rejects(
      () =>
        createTeacherSyllabusParse(teacher.id, course.id, {
          provider: new MockAIProvider(),
        }),
      /尚未上传教学大纲/u,
    );

    const baseline = await Promise.all([
      prisma.assignment.count(),
      prisma.classMembership.count(),
      prisma.submission.count(),
    ]);
    const storage = new LocalStorageService(root);
    const firstPdf = await textPdf();
    const firstSyllabus = await uploadTeacherCourseSyllabus(
      teacher.id,
      course.id,
      uploadFile(firstPdf),
      auditContext,
      { storage },
    );
    const first = await createTeacherSyllabusParse(teacher.id, course.id, {
      provider: new MockAIProvider(),
      storage,
    });
    assert.equal(first.reused, false);
    assert.equal(first.draft.status, "SUCCEEDED");
    assert.equal(first.draft.syllabus.versionNumber, 1);
    assert.ok(first.draft.result);

    const replay = await createTeacherSyllabusParse(teacher.id, course.id, {
      provider: providerWith(() => {
        throw new Error("reused draft must not call provider");
      }),
      storage,
    });
    assert.equal(replay.reused, true);
    assert.equal(replay.draft.id, first.draft.id);

    await assert.rejects(
      () =>
        createTeacherSyllabusParse(teacherTwo.id, course.id, {
          provider: new MockAIProvider(),
          storage,
        }),
      /课程不存在/u,
    );

    const secondSyllabus = await uploadTeacherCourseSyllabus(
      teacher.id,
      course.id,
      uploadFile(await textPdf("Python Syllabus version two")),
      auditContext,
      { storage },
    );
    assert.equal(secondSyllabus.versionNumber, 2);
    assert.notEqual(secondSyllabus.id, firstSyllabus.id);
    const second = await createTeacherSyllabusParse(teacher.id, course.id, {
      provider: new MockAIProvider(),
      storage,
    });
    assert.notEqual(second.draft.id, first.draft.id);
    const queried = await getTeacherSyllabusParses(teacher.id, course.id);
    assert.equal(queried.current?.syllabus.versionNumber, 2);
    assert.equal(queried.history.length, 2);
    assert.equal(
      queried.history.find((item) => item.syllabus.versionNumber === 1)
        ?.isCurrentSyllabusVersion,
      false,
    );

    await uploadTeacherCourseSyllabus(
      teacher.id,
      course.id,
      uploadFile(await textPdf("Python Syllabus version three")),
      auditContext,
      { storage },
    );
    await assert.rejects(
      () =>
        createTeacherSyllabusParse(teacher.id, course.id, {
          provider: providerWith(() => ({ invalid: true })),
          storage,
        }),
      /结构化解析失败/u,
    );
    let failed = await getTeacherSyllabusParses(teacher.id, course.id);
    assert.equal(failed.current?.status, "FAILED");
    assert.equal(failed.current?.errorCode, "INVALID_AI_OUTPUT");
    assert.equal(failed.current?.result, null);

    await assert.rejects(
      () =>
        createTeacherSyllabusParse(teacher.id, course.id, {
          provider: new MockAIProvider(),
          storage,
          failSuccessWriteForTest: true,
          logger: { error: () => undefined },
        }),
      /解析失败/u,
    );
    failed = await getTeacherSyllabusParses(teacher.id, course.id);
    assert.equal(failed.current?.status, "FAILED");
    assert.equal(failed.current?.result, null);

    const recovered = await createTeacherSyllabusParse(teacher.id, course.id, {
      provider: new MockAIProvider(),
      storage,
    });
    assert.equal(recovered.draft.status, "SUCCEEDED");
    assert.equal(recovered.draft.executionCount, 3);

    assert.deepEqual(
      await Promise.all([
        prisma.assignment.count(),
        prisma.classMembership.count(),
        prisma.submission.count(),
      ]),
      baseline,
    );
  } finally {
    if (createdCourseIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: { targetId: { in: createdCourseIds } },
      });
      await prisma.syllabusParseDraft.deleteMany({
        where: { courseId: { in: createdCourseIds } },
      });
      await prisma.course.deleteMany({
        where: { id: { in: createdCourseIds } },
      });
    }
    if (previousRoot === undefined) delete process.env.LOCAL_UPLOAD_ROOT;
    else process.env.LOCAL_UPLOAD_ROOT = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
  }
});
