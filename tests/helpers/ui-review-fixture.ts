import type { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { qualityReportSourceSnapshotSchema } from "../../services/quality-reports/schemas";
import {
  buildDeterministicNarrative,
  calculateQualityReportStatistics,
} from "../../services/quality-reports/calculation";
import { auditQualityReportDraft } from "../../services/quality-reports/quality-audit";
import {
  QUALITY_REPORT_TEMPLATE_CHECKSUM,
  QUALITY_REPORT_TEMPLATE_VERSION,
  QUALITY_REPORT_RULE_VERSION,
  QUALITY_REPORT_PROMPT_VERSION,
} from "../../services/quality-reports/constants";

/** Only call inside the preview's validated, disposable UI test schema. */
export async function seedUIReviewFixture(
  prisma: PrismaClient,
  courseId: string,
  teacherId: string,
) {
  const course = await prisma.course.findUniqueOrThrow({
    where: { id: courseId },
  });
  const first = await prisma.classroom.findFirstOrThrow({
    where: { teacherId, courseId },
    orderBy: { createdAt: "asc" },
  });
  await prisma.classroom.update({
    where: { id: first.id },
    data: { name: "Python 验收一班" },
  });
  const second = await prisma.classroom.findFirst({
    where: { teacherId, courseId, name: "Python 验收二班" },
  });
  if (!second)
    await prisma.classroom.create({
      data: {
        teacherId,
        courseId,
        name: "Python 验收二班",
        joinCode: `UI-${createHash("sha256").update(courseId).digest("hex").slice(0, 16)}`,
      },
    });
  const source = qualityReportSourceSnapshotSchema.parse({
    course: {
      id: courseId,
      name: course.name,
      courseNo: course.courseNo,
      term: course.term,
      teacherName: "验收教师",
      courseNature: "专业课",
      credits: 2,
      majorClass: "Python 验收一班",
      college: "验收学院",
      major: "软件工程",
      teachingMethodDetails: "",
      scoringCriteria: "",
    },
    classroom: { id: first.id, name: "Python 验收一班" },
    sourceType: "UPLOAD",
    components: [{ code: "final", name: "期末考试", weight: 1 }],
    students: [
      {
        studentId: null,
        studentNo: "0001",
        displayName: "合成学生",
        status: "SCORED",
        componentScores: { final: 80 },
        totalScore: 80,
      },
    ],
    outcomes: [],
    attendance: { sessionCount: 0, presentRate: null },
    survey: null,
    sourceReference: {
      uiReviewFixture: true,
      isolatedFromFormalGradebook: true,
    },
  });
  const statistics = calculateQualityReportStatistics(source);
  const narrative = buildDeterministicNarrative(source, statistics);
  const qualityAudit = auditQualityReportDraft(source, statistics, narrative);
  const existing = await prisma.courseQualityReport.findFirst({
    where: { courseId, templateVersion: QUALITY_REPORT_TEMPLATE_VERSION },
  });
  if (!existing)
    await prisma.courseQualityReport.create({
      data: {
        courseId,
        classroomId: first.id,
        requestedById: teacherId,
        sourceType: "UPLOAD",
        status: "SUCCEEDED",
        aiStatus: "FALLBACK",
        versionNumber: 1,
        inputFingerprint: createHash("sha256")
          .update(`ui-review:${courseId}`)
          .digest("hex"),
        templateVersion: QUALITY_REPORT_TEMPLATE_VERSION,
        templateChecksumSha256: QUALITY_REPORT_TEMPLATE_CHECKSUM,
        calculationRuleVersion: QUALITY_REPORT_RULE_VERSION,
        promptVersion: QUALITY_REPORT_PROMPT_VERSION,
        sourceSnapshotJson: JSON.parse(JSON.stringify(source)),
        statisticsSnapshotJson: JSON.parse(JSON.stringify(statistics)),
        narrativeSnapshotJson: JSON.parse(
          JSON.stringify({ ...narrative, qualityAudit }),
        ),
        completedAt: new Date(),
      },
    });
  return prisma.classroom.findMany({
    where: { teacherId, courseId },
    orderBy: { createdAt: "asc" },
  });
}
