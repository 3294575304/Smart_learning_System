import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";

const structure: SyllabusParseOutput = {
  courseInfo: {
    courseName: "Python",
    courseCode: "PY",
    description: null,
    credits: null,
    totalHours: 1,
    theoryHours: 1,
    practiceHours: 0,
    sourceRefs: [{ page: 1, verified: true }],
  },
  objectives: [
    {
      code: "O1",
      title: "知识目标",
      description: "掌握基础知识",
      sourceRefs: [{ page: 1, verified: true }],
    },
    {
      code: "O2",
      title: "能力目标",
      description: "运用基础知识解决问题",
      sourceRefs: [{ page: 1, verified: true }],
    },
  ],
  chapters: [
    {
      code: "C1",
      title: "基础",
      description: null,
      suggestedHours: 1,
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
      allocationRate: 50,
      sourceRefs: [{ page: 1, verified: true }],
    },
    {
      objectiveCode: "O2",
      assessmentCode: "A1",
      allocationRate: 50,
      sourceRefs: [{ page: 1, verified: true }],
    },
  ],
  materials: [],
  warnings: [],
};

export async function publishExamTestSyllabus(
  prisma: PrismaClient,
  courseId: string,
  teacherId: string,
) {
  const source = await prisma.courseSyllabus.create({
    data: {
      courseId,
      uploadedById: teacherId,
      versionNumber: 1,
      originalName: "test.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
      storageKey: `exam-test/${randomUUID()}.pdf`,
    },
  });
  const draft = await prisma.syllabusParseDraft.create({
    data: {
      courseId,
      syllabusId: source.id,
      requestedById: teacherId,
      status: "SUCCEEDED",
      parserVersion: "test",
      promptVersion: "test",
      ruleVersion: "test",
      structuredResult: structure,
    },
  });
  const review = await prisma.syllabusReviewRevision.create({
    data: {
      courseId,
      syllabusId: source.id,
      parseDraftId: draft.id,
      editedById: teacherId,
      revisionNumber: 1,
      structureJson: structure,
    },
  });
  const published = await prisma.publishedSyllabusStructure.create({
    data: {
      courseId,
      syllabusId: source.id,
      parseDraftId: draft.id,
      reviewRevisionId: review.id,
      publishedById: teacherId,
      versionNumber: 1,
      structureJson: structure,
    },
  });
  await prisma.course.update({
    where: { id: courseId },
    data: { currentPublishedSyllabusStructureId: published.id },
  });
  return published;
}
