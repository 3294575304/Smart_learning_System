import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  AIEnhancementStatus,
  AuditAction,
  KnowledgeGraphStatus,
  PrismaClient,
} from "@prisma/client";

import { ResourceNotFoundError } from "@/services/auth/policy";
import { KnowledgeGraphOperationError } from "@/services/knowledge-graph/errors";
import {
  getTeacherKnowledgeGraph,
  publishTeacherKnowledgeGraph,
  saveTeacherKnowledgeGraphReview,
} from "@/services/knowledge-graph/service";
import type { KnowledgeGraphStructure } from "@/services/knowledge-graph/schemas";
import { assertIsolatedIntegrationEnvironment } from "../integration/database";

assertIsolatedIntegrationEnvironment("HTTP_INTEGRATION_SCHEMA");
const prisma = new PrismaClient();
const context = { ipAddress: "127.0.0.1", userAgent: "graph-publish-test" };

function graph(courseId: string, withRelated = false): KnowledgeGraphStructure {
  const courseKey = `course:${courseId}`;
  const chapterKey = "chapter:one";
  const firstKey = "kp:first";
  const secondKey = "kp:second";
  return {
    nodes: [
      {
        key: courseKey,
        conceptKey: courseKey,
        type: "COURSE",
        code: "COURSE",
        name: "Python 测试课程",
        description: null,
        importance: null,
        isKeyTopic: false,
        isDifficultTopic: false,
        objectiveMappings: [],
        assessmentMappings: [],
        sourceType: "SYLLABUS",
        sourceRefs: [],
        confidence: null,
        sourcePath: "courseInfo",
        sortOrder: 0,
      },
      {
        key: chapterKey,
        conceptKey: chapterKey,
        type: "CHAPTER",
        code: "CH-1",
        name: "第一章",
        description: null,
        importance: null,
        isKeyTopic: false,
        isDifficultTopic: false,
        objectiveMappings: [],
        assessmentMappings: [],
        sourceType: "SYLLABUS",
        sourceRefs: [],
        confidence: null,
        sourcePath: "chapters.CH-1",
        sortOrder: 1,
      },
      ...[firstKey, secondKey].map((key, index) => ({
        key,
        conceptKey: key,
        type: "KNOWLEDGE_POINT" as const,
        code: `KP-${index + 1}`,
        name: `知识点 ${index + 1}`,
        description: null,
        importance: "CORE" as const,
        isKeyTopic: false,
        isDifficultTopic: false,
        objectiveMappings: [],
        assessmentMappings: [],
        sourceType: "SYLLABUS" as const,
        sourceRefs: [],
        confidence: null,
        sourcePath: `chapters.CH-1.knowledgePoints.KP-${index + 1}`,
        sortOrder: index,
      })),
    ],
    edges: [
      {
        key: "contains:course:chapter",
        type: "CONTAINS",
        from: courseKey,
        to: chapterKey,
        description: null,
        sourceType: "SYLLABUS",
        sourceRefs: [],
        confidence: null,
      },
      ...[firstKey, secondKey].map((key, index) => ({
        key: `contains:chapter:${index + 1}`,
        type: "CONTAINS" as const,
        from: chapterKey,
        to: key,
        description: null,
        sourceType: "SYLLABUS" as const,
        sourceRefs: [],
        confidence: null,
      })),
      ...(withRelated
        ? [
            {
              key: "related:first:second",
              type: "RELATED" as const,
              from: firstKey,
              to: secondKey,
              description: "AI 建议关系",
              sourceType: "AI_INFERRED" as const,
              sourceRefs: [],
              confidence: 0.8,
            },
          ]
        : []),
    ],
  };
}

test("AI 降级审核稿可事务发布、幂等复用并维护正式指针与审计", async () => {
  const suffix = randomBytes(5).toString("hex");
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@example.com" },
    select: { id: true },
  });
  const otherUser = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@example.com" },
    select: { id: true },
  });
  const template = await prisma.courseTemplate.findFirstOrThrow({
    where: { isActive: true },
    select: { id: true },
  });
  const course = await prisma.course.create({
    data: {
      templateId: template.id,
      teacherId: teacher.id,
      courseNo: `GRAPH-${suffix}`,
      term: "2026-2027-1",
      name: "Graph publish integration",
    },
  });
  const targetIds: string[] = [];
  try {
    const syllabus = await prisma.courseSyllabus.create({
      data: {
        courseId: course.id,
        uploadedById: teacher.id,
        originalName: "graph-test.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        checksumSha256: "a".repeat(64),
        storageKey: `graph-test/${suffix}.pdf`,
      },
    });
    const parseDraft = await prisma.syllabusParseDraft.create({
      data: {
        courseId: course.id,
        syllabusId: syllabus.id,
        requestedById: teacher.id,
        status: "SUCCEEDED",
        parserVersion: "graph-test-v1",
        promptVersion: "graph-test-v1",
        ruleVersion: "graph-test-v1",
      },
    });
    const syllabusReview = await prisma.syllabusReviewRevision.create({
      data: {
        courseId: course.id,
        syllabusId: syllabus.id,
        parseDraftId: parseDraft.id,
        editedById: teacher.id,
        revisionNumber: 1,
        structureJson: {},
      },
    });
    const publishedSyllabus = await prisma.publishedSyllabusStructure.create({
      data: {
        courseId: course.id,
        syllabusId: syllabus.id,
        parseDraftId: parseDraft.id,
        reviewRevisionId: syllabusReview.id,
        publishedById: teacher.id,
        versionNumber: 1,
        structureJson: {},
      },
    });
    await prisma.course.update({
      where: { id: course.id },
      data: { currentPublishedSyllabusStructureId: publishedSyllabus.id },
    });
    const base = graph(course.id);
    const draft = await prisma.knowledgeGraphDraft.create({
      data: {
        courseId: course.id,
        sourceSyllabusStructureId: publishedSyllabus.id,
        requestedById: teacher.id,
        status: KnowledgeGraphStatus.SUCCEEDED,
        generatorVersion: `graph-test-${suffix}`,
        promptVersion: "graph-test-v1",
        ruleVersion: "graph-test-v1",
        deterministicStructureJson: base,
        generatedStructureJson: base,
        aiInferenceJson: { related: [] },
        aiEnhancementStatus: AIEnhancementStatus.FAILED,
        aiWarningCode: "PROVIDER_HTTP_ERROR",
        aiWarningMessage: "AI 服务返回了 HTTP 错误。",
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });
    targetIds.push(draft.id);
    const reviewOne = await saveTeacherKnowledgeGraphReview(
      teacher.id,
      course.id,
      draft.id,
      { expectedRevisionNumber: 0, structure: base },
      context,
    );
    targetIds.push(reviewOne.id);

    const dangling = structuredClone(base);
    dangling.edges.push({
      key: "dangling",
      type: "RELATED",
      from: "kp:first",
      to: "missing",
      description: null,
      sourceType: "TEACHER",
      sourceRefs: [],
      confidence: null,
    });
    await assert.rejects(() =>
      saveTeacherKnowledgeGraphReview(
        teacher.id,
        course.id,
        draft.id,
        { expectedRevisionNumber: 1, structure: dangling },
        context,
      ),
    );
    assert.equal(
      await prisma.knowledgeGraphReviewRevision.count({
        where: { graphDraftId: draft.id },
      }),
      1,
    );

    await assert.rejects(() =>
      publishTeacherKnowledgeGraph(
        teacher.id,
        course.id,
        draft.id,
        {
          reviewRevisionId: reviewOne.id,
          expectedRevisionNumber: 1,
          publishedSyllabusStructureId: publishedSyllabus.id,
        },
        { ipAddress: null, userAgent: "\0" },
      ),
    );
    assert.equal(
      await prisma.publishedKnowledgeGraphVersion.count({
        where: { courseId: course.id },
      }),
      0,
    );
    assert.equal(
      await prisma.knowledgeGraphConcept.count({
        where: { courseId: course.id },
      }),
      0,
    );

    const publishedOne = await publishTeacherKnowledgeGraph(
      teacher.id,
      course.id,
      draft.id,
      {
        reviewRevisionId: reviewOne.id,
        expectedRevisionNumber: 1,
        publishedSyllabusStructureId: publishedSyllabus.id,
      },
      context,
    );
    targetIds.push(publishedOne.id);
    const replay = await publishTeacherKnowledgeGraph(
      teacher.id,
      course.id,
      draft.id,
      {
        reviewRevisionId: reviewOne.id,
        expectedRevisionNumber: 1,
        publishedSyllabusStructureId: publishedSyllabus.id,
      },
      context,
    );
    assert.equal(replay.id, publishedOne.id);
    assert.equal(
      await prisma.publishedKnowledgeGraphVersion.count({
        where: { courseId: course.id },
      }),
      1,
    );
    assert.equal(
      await prisma.publishedKnowledgeGraphEdge.count({
        where: { graphVersionId: publishedOne.id, relationType: "RELATED" },
      }),
      0,
    );

    const enhanced = graph(course.id, true);
    await prisma.knowledgeGraphDraft.update({
      where: { id: draft.id },
      data: {
        generatedStructureJson: enhanced,
        aiEnhancementStatus: AIEnhancementStatus.SUCCEEDED,
        aiInferenceJson: { related: [{ from: "kp:first", to: "kp:second" }] },
      },
    });
    const reviewTwo = await saveTeacherKnowledgeGraphReview(
      teacher.id,
      course.id,
      draft.id,
      { expectedRevisionNumber: 1, structure: enhanced },
      context,
    );
    targetIds.push(reviewTwo.id);
    await assert.rejects(
      () =>
        publishTeacherKnowledgeGraph(
          teacher.id,
          course.id,
          draft.id,
          {
            reviewRevisionId: reviewTwo.id,
            expectedRevisionNumber: 1,
            publishedSyllabusStructureId: publishedSyllabus.id,
          },
          context,
        ),
      (error: unknown) =>
        error instanceof KnowledgeGraphOperationError &&
        error.status === 409 &&
        error.code === "GRAPH_REVISION_CONFLICT",
    );
    const publishedTwo = await publishTeacherKnowledgeGraph(
      teacher.id,
      course.id,
      draft.id,
      {
        reviewRevisionId: reviewTwo.id,
        expectedRevisionNumber: 2,
        publishedSyllabusStructureId: publishedSyllabus.id,
      },
      context,
    );
    targetIds.push(publishedTwo.id);
    assert.equal(publishedTwo.versionNumber, 2);
    assert.equal(
      await prisma.publishedKnowledgeGraphEdge.count({
        where: { graphVersionId: publishedTwo.id, relationType: "RELATED" },
      }),
      1,
    );
    const state = await getTeacherKnowledgeGraph(teacher.id, course.id);
    assert.equal(state.published.current?.id, publishedTwo.id);
    assert.deepEqual(
      state.published.history.map((item) => item.versionNumber),
      [2, 1],
    );
    assert.equal(
      await prisma.auditLog.count({
        where: {
          action: AuditAction.KNOWLEDGE_GRAPH_PUBLISHED,
          targetId: { in: [publishedOne.id, publishedTwo.id] },
        },
      }),
      2,
    );
    await assert.rejects(
      () =>
        publishTeacherKnowledgeGraph(
          otherUser.id,
          course.id,
          draft.id,
          {
            reviewRevisionId: reviewTwo.id,
            expectedRevisionNumber: 2,
            publishedSyllabusStructureId: publishedSyllabus.id,
          },
          context,
        ),
      ResourceNotFoundError,
    );
  } finally {
    await prisma.course.update({
      where: { id: course.id },
      data: {
        currentPublishedKnowledgeGraphVersionId: null,
        currentPublishedSyllabusStructureId: null,
      },
    });
    const versions = await prisma.publishedKnowledgeGraphVersion.findMany({
      where: { courseId: course.id },
      select: { id: true },
    });
    const versionIds = versions.map((item) => item.id);
    await prisma.auditLog.deleteMany({
      where: { targetId: { in: targetIds } },
    });
    await prisma.publishedKnowledgeGraphEdge.deleteMany({
      where: { graphVersionId: { in: versionIds } },
    });
    await prisma.publishedKnowledgeGraphNode.deleteMany({
      where: { graphVersionId: { in: versionIds } },
    });
    await prisma.publishedKnowledgeGraphVersion.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.knowledgeGraphConcept.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.knowledgeGraphReviewRevision.deleteMany({
      where: { courseId: course.id },
    });
    await prisma.knowledgeGraphDraft.deleteMany({
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
    await prisma.courseSyllabus.deleteMany({ where: { courseId: course.id } });
    await prisma.course.delete({ where: { id: course.id } });
  }
});
