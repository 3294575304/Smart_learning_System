import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";

import type { AIProvider, AIProviderOptions } from "@/services/ai/provider";
import { MockAIProvider } from "@/services/ai/mock-provider";
import {
  createTeacherCourse,
  listTeacherCourseTemplates,
  uploadTeacherCourseSyllabus,
  type CourseSyllabusUploadFile,
} from "@/services/courses/service";
import { LocalStorageService } from "@/services/storage/local-storage";
import { extractTextFromPdf } from "@/services/syllabus-parsing/pdf-extractor";
import { parseSyllabusStructure } from "@/services/syllabus-parsing/parser";
import type {
  SyllabusParseInput,
  SyllabusParseOutput,
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
    totalHours: 32,
    theoryHours: 20,
    practiceHours: 12,
  },
  objectives: [
    {
      code: "OBJ-1",
      title: "Programming foundations",
      description: "Understand Python foundations.",
    },
  ],
  chapters: [
    {
      code: "CH-1",
      title: "Introduction",
      description: null,
      suggestedHours: 2,
      order: 1,
      knowledgePoints: [
        {
          code: "KP-1",
          name: "Basic syntax",
          description: null,
          importance: "CORE",
        },
      ],
    },
  ],
  assessments: [
    {
      name: "Final examination",
      type: "EXAM",
      weight: 100,
      description: null,
    },
  ],
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

test("two invalid AI outputs fail without creating a fabricated fallback", async () => {
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
  assert.equal(calls, 2);
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
    assert.equal(failed.current?.errorCode, "INVALID_PROVIDER_OUTPUT");
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
