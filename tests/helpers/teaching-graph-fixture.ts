import { randomBytes } from "node:crypto";
import {
  SyllabusParseStatus,
  KnowledgeGraphStatus,
  KnowledgeGraphNodeType,
  KnowledgeGraphSourceType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
export async function createPublishedGraphFixture(
  courseId: string,
  teacherId: string,
) {
  const suffix = randomBytes(5).toString("hex");
  const syllabus = await prisma.courseSyllabus.create({
    data: {
      courseId,
      uploadedById: teacherId,
      versionNumber: 1,
      originalName: "concept-mastery-test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      storageKey: `concept-mastery/${suffix}/syllabus.pdf`,
    },
  });
  const parseDraft = await prisma.syllabusParseDraft.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      requestedById: teacherId,
      status: SyllabusParseStatus.SUCCEEDED,
      parserVersion: `test-parser-${suffix}`,
      promptVersion: "test-prompt-v1",
      ruleVersion: "test-rule-v1",
      structuredResult: {},
    },
  });
  const syllabusReview = await prisma.syllabusReviewRevision.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      parseDraftId: parseDraft.id,
      editedById: teacherId,
      revisionNumber: 1,
      structureJson: {},
    },
  });
  const publishedSyllabus = await prisma.publishedSyllabusStructure.create({
    data: {
      courseId,
      syllabusId: syllabus.id,
      parseDraftId: parseDraft.id,
      reviewRevisionId: syllabusReview.id,
      publishedById: teacherId,
      versionNumber: 1,
      structureJson: {},
    },
  });
  const graphDraft = await prisma.knowledgeGraphDraft.create({
    data: {
      courseId,
      sourceSyllabusStructureId: publishedSyllabus.id,
      requestedById: teacherId,
      status: KnowledgeGraphStatus.SUCCEEDED,
      generatorVersion: `test-generator-${suffix}`,
      promptVersion: "test-prompt-v1",
      ruleVersion: "test-rule-v1",
      progress: 100,
      successCount: 1,
      deterministicStructureJson: {},
      generatedStructureJson: {},
    },
  });

  async function publishVersion(
    versionNumber: number,
    includedConceptIds: readonly string[],
  ) {
    const review = await prisma.knowledgeGraphReviewRevision.create({
      data: {
        courseId,
        graphDraftId: graphDraft.id,
        sourceSyllabusStructureId: publishedSyllabus.id,
        editedById: teacherId,
        revisionNumber: versionNumber,
        structureJson: {},
      },
    });
    const version = await prisma.publishedKnowledgeGraphVersion.create({
      data: {
        courseId,
        sourceSyllabusStructureId: publishedSyllabus.id,
        graphDraftId: graphDraft.id,
        reviewRevisionId: review.id,
        publishedById: teacherId,
        versionNumber,
        structureJson: {},
        nodes: {
          create: includedConceptIds.map((conceptId, index) => ({
            conceptId,
            nodeType: KnowledgeGraphNodeType.KNOWLEDGE_POINT,
            code: `V${versionNumber}-C${index + 1}`,
            name: `Version ${versionNumber} concept ${index + 1}`,
            sourceType: KnowledgeGraphSourceType.TEACHER,
            sourceRefs: [],
            sortOrder: index + 1,
          })),
        },
      },
      include: { nodes: { orderBy: { sortOrder: "asc" } } },
    });
    await prisma.course.update({
      where: { id: courseId },
      data: { currentPublishedKnowledgeGraphVersionId: version.id },
    });
    return version;
  }

  return { publishVersion };
}
