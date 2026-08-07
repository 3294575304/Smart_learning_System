import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { AuditAction, GradeSourceType, PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";

import {
  generateTeacherAssessmentSchemeDraft,
  getTeacherAssessmentSchemeWorkspace,
  publishTeacherAssessmentScheme,
  saveTeacherAssessmentSchemeDraft,
} from "@/services/assessment-schemes/service";
import {
  createTeacherCourse,
  listTeacherCourseTemplates,
} from "@/services/courses/service";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";
import type { StorageService } from "@/services/storage/types";

const prisma = new PrismaClient();
const context = {
  ipAddress: "127.0.0.1",
  userAgent: "assessment-scheme-test",
};

async function textPdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage();
  page.drawText("Python syllabus assessment source", {
    x: 40,
    y: 760,
    font,
    size: 12,
  });
  return Buffer.from(await document.save());
}

class MemoryStorage implements StorageService {
  constructor(private readonly data: Buffer) {}
  async save() {}
  async read() {
    return this.data;
  }
  async delete() {}
}

const syllabus: SyllabusParseOutput = {
  courseInfo: {
    courseName: "Python",
    courseCode: "PY",
    description: null,
    credits: null,
    totalHours: 32,
    theoryHours: 20,
    practiceHours: 12,
    sourceRefs: [{ page: 1, verified: true }],
  },
  objectives: [
    {
      code: "O1",
      title: "知识目标",
      description: "掌握基础知识",
      sourceRefs: [{ page: 1, verified: true }],
    },
  ],
  chapters: [
    {
      code: "C1",
      title: "基础",
      description: null,
      suggestedHours: 2,
      order: 1,
      sourceRefs: [{ page: 1, verified: true }],
      knowledgePoints: [
        {
          code: "K1",
          name: "变量",
          description: null,
          importance: "CORE",
          sourceRefs: [{ page: 1, verified: true }],
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
      code: "A1",
      name: "期末考试",
      type: "期末考试",
      weight: 100,
      description: null,
      sourceRefs: [{ page: 1, verified: true }],
    },
  ],
  objectiveAssessmentMappings: [
    {
      objectiveCode: "O1",
      assessmentCode: "A1",
      sourceRefs: [{ page: 1, verified: true }],
    },
  ],
  materials: [],
  warnings: [],
};

test("考核方案草稿乐观并发、正式发布不可变且重复发布幂等", async () => {
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
    select: { id: true },
  });
  const template = (await listTeacherCourseTemplates()).find(
    (item) => item.code === "python-programming-v1",
  );
  assert.ok(template);
  const course = await createTeacherCourse(
    teacher.id,
    {
      templateId: template.id,
      courseNo: `SCHEME-${randomBytes(4).toString("hex")}`,
      term: "2026-2027-1",
      name: "Assessment Scheme Test",
      description: null,
    },
    context,
  );
  const storage = new MemoryStorage(await textPdf());
  try {
    const source = await prisma.courseSyllabus.create({
      data: {
        courseId: course.id,
        uploadedById: teacher.id,
        versionNumber: 1,
        originalName: "syllabus.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        checksumSha256: "a".repeat(64),
        storageKey: `test/${course.id}.pdf`,
      },
    });
    const parseDraft = await prisma.syllabusParseDraft.create({
      data: {
        courseId: course.id,
        syllabusId: source.id,
        requestedById: teacher.id,
        status: "SUCCEEDED",
        parserVersion: "syllabus-parser-v3",
        promptVersion: "syllabus-structure-v3",
        ruleVersion: "syllabus-validation-v3",
        structuredResult: syllabus,
        extractedTextMetadata: { pageCount: 1 },
      },
    });
    const syllabusReview = await prisma.syllabusReviewRevision.create({
      data: {
        courseId: course.id,
        syllabusId: source.id,
        parseDraftId: parseDraft.id,
        editedById: teacher.id,
        revisionNumber: 1,
        structureJson: syllabus,
      },
    });
    const publishedSyllabus = await prisma.publishedSyllabusStructure.create({
      data: {
        courseId: course.id,
        syllabusId: source.id,
        parseDraftId: parseDraft.id,
        reviewRevisionId: syllabusReview.id,
        publishedById: teacher.id,
        versionNumber: 1,
        structureJson: syllabus,
      },
    });
    await prisma.course.update({
      where: { id: course.id },
      data: { currentPublishedSyllabusStructureId: publishedSyllabus.id },
    });

    const generated = await generateTeacherAssessmentSchemeDraft(
      teacher.id,
      course.id,
      false,
      context,
      { storage },
    );
    assert.equal(generated.revisionNumber, 1);
    const replay = await generateTeacherAssessmentSchemeDraft(
      teacher.id,
      course.id,
      false,
      context,
      { storage },
    );
    assert.equal(replay.revisionNumber, 1);

    const confirmed = structuredClone(generated.structure);
    confirmed.outcomes[0]!.attainmentThreshold = 60;
    confirmed.components[0]!.fullScore = 100;
    confirmed.components[0]!.sourceType = GradeSourceType.MANUAL;
    confirmed.components[0]!.mappings[0]!.allocationRate = 100;
    const saved = await saveTeacherAssessmentSchemeDraft(
      teacher.id,
      course.id,
      { expectedRevisionNumber: 1, structure: confirmed },
      context,
    );
    assert.equal(saved.revisionNumber, 2);
    await assert.rejects(
      () =>
        saveTeacherAssessmentSchemeDraft(
          teacher.id,
          course.id,
          { expectedRevisionNumber: 1, structure: confirmed },
          context,
        ),
      /已被其他操作更新/u,
    );

    const published = await publishTeacherAssessmentScheme(
      teacher.id,
      course.id,
      saved.reviewRevisionId,
      context,
    );
    const publishedReplay = await publishTeacherAssessmentScheme(
      teacher.id,
      course.id,
      saved.reviewRevisionId,
      context,
    );
    assert.equal(publishedReplay.id, published.id);
    assert.equal(
      await prisma.publishedAssessmentScheme.count({
        where: { reviewRevisionId: saved.reviewRevisionId },
      }),
      1,
    );
    assert.equal(
      await prisma.publishedAssessmentComponent.count({
        where: { schemeId: published.id },
      }),
      1,
    );
    assert.equal(
      await prisma.publishedAssessmentOutcomeMapping.count({
        where: { schemeId: published.id },
      }),
      1,
    );

    const changed = structuredClone(confirmed);
    changed.components[0]!.name = "修改后的草稿名称";
    await saveTeacherAssessmentSchemeDraft(
      teacher.id,
      course.id,
      { expectedRevisionNumber: 2, structure: changed },
      context,
    );
    const workspace = await getTeacherAssessmentSchemeWorkspace(
      teacher.id,
      course.id,
    );
    assert.equal(workspace.current?.structure.components[0]?.name, "期末考试");
    assert.equal(
      workspace.draft?.structure.components[0]?.name,
      "修改后的草稿名称",
    );
    assert.equal(
      (await prisma.auditLog.count({
        where: {
          actorId: teacher.id,
          action: {
            in: [
              AuditAction.ASSESSMENT_SCHEME_DRAFT_GENERATED,
              AuditAction.ASSESSMENT_SCHEME_REVIEW_SAVED,
              AuditAction.ASSESSMENT_SCHEME_PUBLISHED,
            ],
          },
        },
      })) >= 4,
      true,
    );
  } finally {
    const [schemes, reviews, drafts] = await Promise.all([
      prisma.publishedAssessmentScheme.findMany({
        where: { courseId: course.id },
        select: { id: true },
      }),
      prisma.assessmentSchemeReviewRevision.findMany({
        where: { courseId: course.id },
        select: { id: true },
      }),
      prisma.assessmentSchemeDraft.findMany({
        where: { courseId: course.id },
        select: { id: true },
      }),
    ]);
    await prisma.course.update({
      where: { id: course.id },
      data: {
        currentPublishedAssessmentSchemeId: null,
        currentPublishedSyllabusStructureId: null,
      },
    });
    await prisma.publishedAssessmentOutcomeMapping.deleteMany({
      where: { schemeId: { in: schemes.map((item) => item.id) } },
    });
    await prisma.publishedAssessmentComponent.deleteMany({
      where: { schemeId: { in: schemes.map((item) => item.id) } },
    });
    await prisma.publishedCourseOutcome.deleteMany({
      where: { schemeId: { in: schemes.map((item) => item.id) } },
    });
    await prisma.publishedAssessmentScheme.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.auditLog.deleteMany({
      where: {
        targetId: {
          in: [
            ...schemes.map((item) => item.id),
            ...reviews.map((item) => item.id),
            ...drafts.map((item) => item.id),
            course.id,
          ],
        },
      },
    });
    await prisma.assessmentSchemeReviewRevision.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.assessmentSchemeDraft.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.publishedSyllabusStructure.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.syllabusReviewRevision.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.syllabusParseDraft.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.courseSyllabus.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.course.delete({ where: { id: course.id } });
  }
});
