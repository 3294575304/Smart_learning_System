import {
  AuditAction,
  AuditTargetType,
  OutcomeStudentStatus,
  Prisma,
} from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  calculateClassOutcome,
  calculateStudentOutcome,
  OUTCOME_ATTAINMENT_RULE_VERSION,
  type ComponentScore,
} from "@/services/outcome-attainment/calculation";
import { OutcomeAttainmentError } from "@/services/outcome-attainment/errors";

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

export async function generateTeacherOutcomeAttainment(
  teacherId: string,
  gradebookId: string,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`SELECT "id" FROM "CourseGradebook" WHERE "id" = ${gradebookId} FOR UPDATE`;
      const gradebook = await transaction.courseGradebook.findFirst({
        where: {
          id: gradebookId,
          course: { teacherId },
          classroom: { teacherId },
        },
        include: {
          course: true,
          classroom: true,
          scheme: {
            include: {
              outcomes: { orderBy: { sortOrder: "asc" } },
              components: true,
              publishedAssessmentOutcomeMappings: true,
            },
          },
          currentPublication: {
            include: {
              students: {
                include: {
                  gradeRevision: true,
                  student: {
                    select: {
                      profile: {
                        select: { studentNo: true, displayName: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!gradebook) throw new ResourceNotFoundError("成绩台账不存在。");
      if (!gradebook.currentPublication)
        throw new OutcomeAttainmentError(
          "请先发布正式成绩版本。",
          409,
          "GRADEBOOK_PUBLICATION_REQUIRED",
        );
      if (
        !gradebook.scheme.sourcePublishedSyllabusStructureId ||
        gradebook.scheme.outcomes.length === 0
      )
        throw new OutcomeAttainmentError(
          "正式考核方案没有来自教学大纲的课程目标，不能计算达成度。",
          409,
          "SYLLABUS_OUTCOMES_REQUIRED",
        );
      const snapshot = {
        schemeId: gradebook.schemeId,
        sourceSyllabusStructureId:
          gradebook.scheme.sourcePublishedSyllabusStructureId,
        publicationId: gradebook.currentPublication.id,
        outcomes: gradebook.scheme.outcomes.map((outcome) => ({
          id: outcome.id,
          code: outcome.code,
          threshold: outcome.attainmentThreshold.toFixed(2),
        })),
        mappings: gradebook.scheme.publishedAssessmentOutcomeMappings
          .map((mapping) => ({
            componentId: mapping.componentId,
            outcomeId: mapping.outcomeId,
            allocationRate: mapping.allocationRate.toFixed(4),
          }))
          .sort((a, b) =>
            `${a.outcomeId}:${a.componentId}`.localeCompare(
              `${b.outcomeId}:${b.componentId}`,
            ),
          ),
        revisions: gradebook.currentPublication.students
          .map((row) => row.gradeRevisionId)
          .sort(),
        ruleVersion: OUTCOME_ATTAINMENT_RULE_VERSION,
      };
      const inputFingerprint = fingerprint(snapshot);
      const replay = await transaction.courseOutcomeAttainmentRun.findUnique({
        where: {
          gradebookPublicationId_calculationRuleVersion: {
            gradebookPublicationId: gradebook.currentPublication.id,
            calculationRuleVersion: OUTCOME_ATTAINMENT_RULE_VERSION,
          },
        },
        include: { results: { include: { students: true } } },
      });
      if (replay) return { ...replay, reused: true };
      const version =
        (
          await transaction.courseOutcomeAttainmentRun.aggregate({
            where: { gradebookId },
            _max: { versionNumber: true },
          })
        )._max.versionNumber ?? 0;
      const run = await transaction.courseOutcomeAttainmentRun.create({
        data: {
          courseId: gradebook.courseId,
          classroomId: gradebook.classroomId,
          gradebookId,
          schemeId: gradebook.schemeId,
          gradebookPublicationId: gradebook.currentPublication.id,
          sourceSyllabusStructureId:
            gradebook.scheme.sourcePublishedSyllabusStructureId,
          versionNumber: version + 1,
          inputFingerprint,
          calculationRuleVersion: OUTCOME_ATTAINMENT_RULE_VERSION,
          inputSnapshotJson: json(snapshot),
          generatedById: teacherId,
        },
      });
      const componentWeight = new Map(
        gradebook.scheme.components.map((component) => [
          component.id,
          component.weight,
        ]),
      );
      for (const outcome of gradebook.scheme.outcomes) {
        const mappings = gradebook.scheme.publishedAssessmentOutcomeMappings
          .filter((mapping) => mapping.outcomeId === outcome.id)
          .map((mapping) => ({
            componentId: mapping.componentId,
            componentWeight: componentWeight.get(mapping.componentId)!,
            allocationRate: mapping.allocationRate,
          }));
        if (!mappings.length)
          throw new OutcomeAttainmentError(
            `课程目标 ${outcome.code} 缺少考核映射。`,
            409,
            "OUTCOME_MAPPING_REQUIRED",
          );
        const studentRows = gradebook.currentPublication.students.map((row) => {
          const raw = row.gradeRevision
            .componentResultsJson as unknown as ComponentScore[];
          const result = calculateStudentOutcome(
            raw,
            mappings,
            outcome.attainmentThreshold,
          );
          return { row, result };
        });
        const includedScores = studentRows.flatMap((item) =>
          item.result.status === OutcomeStudentStatus.INCLUDED &&
          item.result.score
            ? [item.result.score]
            : [],
        );
        const classResult = calculateClassOutcome(
          includedScores,
          outcome.attainmentThreshold,
        );
        const result = await transaction.courseOutcomeAttainmentResult.create({
          data: {
            runId: run.id,
            outcomeId: outcome.id,
            outcomeCode: outcome.code,
            outcomeTitle: outcome.title,
            threshold: outcome.attainmentThreshold,
            meanScore: classResult.meanScore,
            attainmentIndex: classResult.attainmentIndex,
            attained: classResult.attained,
            participantCount: includedScores.length,
            excludedCount: studentRows.length - includedScores.length,
          },
        });
        await transaction.studentOutcomeAttainmentResult.createMany({
          data: studentRows.map((item) => ({
            resultId: result.id,
            studentId: item.row.studentId,
            gradeRevisionId: item.row.gradeRevisionId,
            status: item.result.status,
            score: item.result.score,
            attained: item.result.attained,
            evidenceJson: json(
              item.result.evidence.map((evidence) => ({
                componentId: evidence.mapping.componentId,
                componentWeight: evidence.mapping.componentWeight.toFixed(4),
                allocationRate: evidence.mapping.allocationRate.toFixed(4),
                componentStatus: evidence.component?.status ?? null,
                componentScore: evidence.component?.score ?? null,
              })),
            ),
          })),
        });
      }
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.OUTCOME_ATTAINMENT_GENERATED,
        targetType: AuditTargetType.OUTCOME_ATTAINMENT_RUN,
        targetId: run.id,
        summary: "生成课程目标达成度版本",
        beforeData: null,
        afterData: {
          gradebookId,
          versionNumber: run.versionNumber,
          publicationId: run.gradebookPublicationId,
          sourceSyllabusStructureId: run.sourceSyllabusStructureId,
          inputFingerprint,
        },
        context,
      });
      const detail =
        await transaction.courseOutcomeAttainmentRun.findUniqueOrThrow({
          where: { id: run.id },
          include: {
            results: {
              include: {
                students: {
                  include: {
                    student: {
                      select: {
                        profile: {
                          select: { studentNo: true, displayName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });
      return { ...detail, reused: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getTeacherOutcomeAttainment(
  teacherId: string,
  gradebookId: string,
) {
  const gradebook = await prisma.courseGradebook.findFirst({
    where: { id: gradebookId, course: { teacherId }, classroom: { teacherId } },
    select: { currentPublicationId: true },
  });
  if (!gradebook) throw new ResourceNotFoundError("成绩台账不存在。");
  const runs = await prisma.courseOutcomeAttainmentRun.findMany({
    where: { gradebookId },
    orderBy: { versionNumber: "desc" },
    include: {
      results: {
        orderBy: { outcomeCode: "asc" },
        include: {
          students: {
            include: {
              student: {
                select: {
                  profile: { select: { studentNo: true, displayName: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  return {
    currentPublicationId: gradebook.currentPublicationId,
    runs: runs.map((run) => ({
      ...run,
      isStale: run.gradebookPublicationId !== gradebook.currentPublicationId,
    })),
  };
}
