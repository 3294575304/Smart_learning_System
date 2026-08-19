import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AuditAction, PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";

import { MockAIProvider } from "@/services/ai/mock-provider";
import {
  createTeacherCourse,
  listTeacherCourseTemplates,
  uploadTeacherCourseSyllabus,
} from "@/services/courses/service";
import { LocalStorageService } from "@/services/storage/local-storage";
import { KnowledgeGraphOperationError } from "@/services/knowledge-graph/errors";
import { getCurrentPublishedSyllabusForKnowledgeGraph } from "@/services/knowledge-graph/syllabus-source";
import { findOrCreateTeacherKnowledgeGraphDraft } from "@/services/knowledge-graph/task-repository";
import { createTeacherSyllabusParse } from "@/services/syllabus-parsing/service";
import {
  getTeacherPublishedSyllabi,
  publishTeacherSyllabusReview,
  saveTeacherSyllabusReview,
} from "@/services/syllabus-parsing/review-service";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";

const prisma = new PrismaClient();
const context = { ipAddress: "127.0.0.1", userAgent: "syllabus-review-test" };

async function textPdf(text: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage();
  page.drawText(text, { x: 40, y: 760, font, size: 12 });
  return Buffer.from(await document.save());
}

function uploadFile(data: Buffer) {
  return {
    name: "syllabus.pdf",
    type: "application/pdf",
    size: data.length,
    arrayBuffer: async () => Uint8Array.from(data).buffer,
  };
}

test("审核修订保持 AI 原稿、阻止并发覆盖并幂等发布不可变正式版本", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "zhixue-review-"));
  const storage = new LocalStorageService(root);
  let courseId: string | null = null;
  try {
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
        courseNo: `REVIEW-${randomBytes(4).toString("hex")}`,
        term: "2026-2027-1",
        name: "Python Review Test",
        description: null,
      },
      context,
    );
    courseId = course.id;
    await uploadTeacherCourseSyllabus(
      teacher.id,
      course.id,
      uploadFile(await textPdf("Python syllabus source text")),
      context,
      { storage },
    );
    const parsed = await createTeacherSyllabusParse(teacher.id, course.id, {
      provider: new MockAIProvider(),
      storage,
    });
    assert.ok(parsed.draft.result && parsed.draft.hasFieldSourceRefs);
    const originalBefore = await prisma.syllabusParseDraft.findUniqueOrThrow({
      where: { id: parsed.draft.id },
      select: { structuredResult: true },
    });
    const edited = structuredClone(parsed.draft.result) as SyllabusParseOutput;
    edited.objectives[0]!.title = "教师审核后的目标";
    edited.assessments = [
      {
        code: "FINAL",
        name: "期末考试",
        type: "EXAM",
        weight: 100,
        description: null,
        sourceRefs: [],
      },
    ];
    edited.objectiveAssessmentMappings = [
      {
        objectiveCode: edited.objectives[0]!.code,
        assessmentCode: "FINAL",
        allocationRate: 100,
        sourceRefs: [],
      },
    ];
    const revision = await saveTeacherSyllabusReview(
      teacher.id,
      course.id,
      parsed.draft.id,
      { expectedRevisionNumber: 0, structure: edited },
      context,
    );
    assert.equal(revision.revisionNumber, 1);
    assert.equal(revision.structure.objectives[0]?.title, "教师审核后的目标");
    assert.deepEqual(
      await prisma.syllabusParseDraft.findUniqueOrThrow({
        where: { id: parsed.draft.id },
        select: { structuredResult: true },
      }),
      originalBefore,
    );
    await assert.rejects(
      () =>
        saveTeacherSyllabusReview(
          teacher.id,
          course.id,
          parsed.draft.id,
          { expectedRevisionNumber: 0, structure: edited },
          context,
        ),
      /已被更新/u,
    );
    const badPage = structuredClone(edited);
    badPage.courseInfo.sourceRefs = [{ page: 999, verified: false }];
    await assert.rejects(
      () =>
        saveTeacherSyllabusReview(
          teacher.id,
          course.id,
          parsed.draft.id,
          { expectedRevisionNumber: 1, structure: badPage },
          context,
        ),
      /页码/u,
    );

    await assert.rejects(
      () => findOrCreateTeacherKnowledgeGraphDraft(teacher.id, course.id),
      (error: unknown) =>
        error instanceof KnowledgeGraphOperationError &&
        error.code === "PUBLISHED_SYLLABUS_REQUIRED",
    );

    await assert.rejects(() =>
      publishTeacherSyllabusReview(
        teacher.id,
        course.id,
        parsed.draft.id,
        revision.id,
        { ipAddress: null, userAgent: "\0" },
      ),
    );
    assert.equal(
      await prisma.publishedSyllabusStructure.count({
        where: { reviewRevisionId: revision.id },
      }),
      0,
    );
    assert.equal(
      (
        await prisma.course.findUniqueOrThrow({
          where: { id: course.id },
          select: { currentPublishedSyllabusStructureId: true },
        })
      ).currentPublishedSyllabusStructureId,
      null,
    );

    const published = await publishTeacherSyllabusReview(
      teacher.id,
      course.id,
      parsed.draft.id,
      revision.id,
      context,
    );
    const replay = await publishTeacherSyllabusReview(
      teacher.id,
      course.id,
      parsed.draft.id,
      revision.id,
      context,
    );
    assert.equal(replay.id, published.id);
    assert.equal(
      await prisma.publishedSyllabusStructure.count({
        where: { reviewRevisionId: revision.id },
      }),
      1,
    );
    const refreshed = await getTeacherPublishedSyllabi(teacher.id, course.id);
    assert.equal(refreshed.current?.id, published.id);
    assert.equal(refreshed.currentPublishedStructure?.id, published.id);
    assert.equal(refreshed.currentPublishedSyllabusStructureId, published.id);
    assert.equal(refreshed.sourceReviewRevisionId, revision.id);
    assert.equal(refreshed.currentReviewRevisionId, revision.id);
    assert.equal(refreshed.isCurrentReviewRevisionPublished, true);
    assert.equal(refreshed.isCurrentPublishedStructureStale, false);

    await prisma.course.update({
      where: { id: course.id },
      data: { currentPublishedSyllabusStructureId: null },
    });
    const orphaned = await getTeacherPublishedSyllabi(teacher.id, course.id);
    assert.equal(orphaned.currentPublishedStructure, null);
    assert.equal(orphaned.currentPublishedSyllabusStructureId, null);
    assert.equal(orphaned.isCurrentReviewRevisionPublished, true);
    const repaired = await publishTeacherSyllabusReview(
      teacher.id,
      course.id,
      parsed.draft.id,
      revision.id,
      context,
    );
    assert.equal(repaired.id, published.id);
    assert.equal(
      (
        await prisma.course.findUniqueOrThrow({
          where: { id: course.id },
          select: { currentPublishedSyllabusStructureId: true },
        })
      ).currentPublishedSyllabusStructureId,
      published.id,
    );
    assert.equal(
      await prisma.publishedSyllabusStructure.count({
        where: { reviewRevisionId: revision.id },
      }),
      1,
    );

    const graphSource = await getCurrentPublishedSyllabusForKnowledgeGraph(
      teacher.id,
      course.id,
    );
    assert.equal(graphSource.id, published.id);
    const queuedGraph = await findOrCreateTeacherKnowledgeGraphDraft(
      teacher.id,
      course.id,
    );
    assert.equal(queuedGraph.sourceSyllabusStructureId, published.id);

    await uploadTeacherCourseSyllabus(
      teacher.id,
      course.id,
      uploadFile(await textPdf("New syllabus source text")),
      context,
      { storage },
    );
    const afterUpload = await getTeacherPublishedSyllabi(teacher.id, course.id);
    assert.equal(afterUpload.current?.id, published.id);
    assert.equal(afterUpload.current?.isFromCurrentSyllabus, false);
    assert.equal(afterUpload.isCurrentPublishedStructureStale, true);
    assert.equal(afterUpload.isCurrentReviewRevisionPublished, false);
    await assert.rejects(
      () => findOrCreateTeacherKnowledgeGraphDraft(teacher.id, course.id),
      (error: unknown) =>
        error instanceof KnowledgeGraphOperationError &&
        error.code === "PUBLISHED_SYLLABUS_STALE",
    );
    const otherUser = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@example.com" },
      select: { id: true },
    });
    await assert.rejects(() =>
      getTeacherPublishedSyllabi(otherUser.id, course.id),
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          actorId: teacher.id,
          action: {
            in: [
              AuditAction.SYLLABUS_REVIEW_SAVED,
              AuditAction.SYLLABUS_STRUCTURE_PUBLISHED,
            ],
          },
          targetId: { in: [revision.id, published.id] },
        },
      }),
      3,
    );
  } finally {
    if (courseId) {
      await prisma.course.update({
        where: { id: courseId },
        data: { currentPublishedSyllabusStructureId: null },
      });
      const [reviewIds, publishedIds] = await Promise.all([
        prisma.syllabusReviewRevision.findMany({
          where: { courseId },
          select: { id: true },
        }),
        prisma.publishedSyllabusStructure.findMany({
          where: { courseId },
          select: { id: true },
        }),
      ]);
      await prisma.auditLog.deleteMany({
        where: {
          targetId: {
            in: [...reviewIds, ...publishedIds].map((item) => item.id),
          },
        },
      });
      await prisma.knowledgeGraphDraft.deleteMany({ where: { courseId } });
      await prisma.publishedSyllabusStructure.deleteMany({
        where: { courseId },
      });
      await prisma.syllabusReviewRevision.deleteMany({ where: { courseId } });
      await prisma.syllabusParseDraft.deleteMany({ where: { courseId } });
      await prisma.course.delete({ where: { id: courseId } });
    }
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("发布校验拒绝空必填项、重复标识、悬空映射和非 100% 权重", async () => {
  const base: SyllabusParseOutput = {
    courseInfo: {
      courseName: "Python",
      courseCode: "PY",
      description: null,
      credits: null,
      totalHours: 32,
      theoryHours: 20,
      practiceHours: 12,
      sourceRefs: [],
    },
    objectives: [
      { code: "O1", title: "目标", description: "描述", sourceRefs: [] },
    ],
    chapters: [
      {
        code: "C1",
        title: "章节",
        description: null,
        suggestedHours: 2,
        order: 1,
        sourceRefs: [],
        knowledgePoints: [
          {
            code: "K1",
            name: "知识点",
            description: null,
            importance: "CORE",
            sourceRefs: [],
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
        name: "考试",
        type: "EXAM",
        weight: 90,
        description: null,
        sourceRefs: [],
      },
    ],
    objectiveAssessmentMappings: [
      {
        objectiveCode: "O404",
        assessmentCode: "A1",
        allocationRate: 100,
        sourceRefs: [],
      },
    ],
    materials: [],
    warnings: [],
  };
  const { publishableSyllabusStructureSchema } =
    await import("@/services/syllabus-parsing/schemas");
  assert.equal(
    publishableSyllabusStructureSchema.safeParse(base).success,
    false,
  );
  assert.equal(
    publishableSyllabusStructureSchema.safeParse({
      ...base,
      courseInfo: { ...base.courseInfo, courseName: null },
    }).success,
    false,
  );
  assert.equal(
    publishableSyllabusStructureSchema.safeParse({
      ...base,
      chapters: [...base.chapters, { ...base.chapters[0]!, order: 2 }],
    }).success,
    false,
  );
});
