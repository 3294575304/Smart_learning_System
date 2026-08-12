import "server-only";

import {
  AuditAction,
  AuditTargetType,
  MembershipStatus,
  Prisma,
  QuestionStatus,
  RecommendationSource,
  RecommendationStatus,
  Role,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { AUTO_GRADABLE_QUESTION_TYPES } from "@/services/assignments/grading";
import { rankCourseRecommendationCandidates } from "@/services/course-recommendations/algorithm";
import {
  COURSE_RECOMMENDATION_RULE_VERSION,
  DEFAULT_COURSE_RECOMMENDATION_POLICY,
} from "@/services/course-recommendations/constants";
import { courseRecommendationFingerprint } from "@/services/course-recommendations/fingerprint";
import type {
  CourseRecommendationGenerationInput,
  CourseTeachingProgressInput,
} from "@/services/course-recommendations/schemas";
import { RecommendationOperationError } from "@/services/recommendations/errors";

function ownedCourseWhere(teacherId: string, courseId: string) {
  return { id: courseId, teacherId };
}

export async function getTeachingProgress(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: ownedCourseWhere(teacherId, courseId),
    select: {
      id: true,
      currentPublishedKnowledgeGraphVersion: {
        select: {
          id: true,
          versionNumber: true,
          nodes: {
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            select: {
              id: true,
              conceptId: true,
              code: true,
              name: true,
              nodeType: true,
            },
          },
        },
      },
      currentTeachingProgressRevision: {
        select: {
          id: true,
          revisionNumber: true,
          graphVersionId: true,
          note: true,
          createdAt: true,
          concepts: { select: { conceptId: true, publishedNodeId: true } },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  return {
    graphVersion: course.currentPublishedKnowledgeGraphVersion
      ? {
          id: course.currentPublishedKnowledgeGraphVersion.id,
          versionNumber:
            course.currentPublishedKnowledgeGraphVersion.versionNumber,
        }
      : null,
    revision: course.currentTeachingProgressRevision,
    nodes: course.currentPublishedKnowledgeGraphVersion?.nodes ?? [],
  };
}

export async function updateTeachingProgress(
  teacherId: string,
  courseId: string,
  input: CourseTeachingProgressInput,
  context: AuditRequestContext,
) {
  const fingerprint = courseRecommendationFingerprint({
    graphVersionId: input.graphVersionId,
    conceptIds: [...input.conceptIds].sort(),
    note: input.note ?? null,
  });
  const result = await prisma.$transaction(
    async (transaction) => {
      const course = await transaction.course.findFirst({
        where: ownedCourseWhere(teacherId, courseId),
        select: {
          currentPublishedKnowledgeGraphVersionId: true,
          currentTeachingProgressRevision: {
            select: {
              id: true,
              revisionNumber: true,
              inputFingerprint: true,
              graphVersionId: true,
              note: true,
              concepts: { select: { conceptId: true } },
            },
          },
        },
      });
      if (!course) throw new ResourceNotFoundError("课程不存在");
      if (!course.currentPublishedKnowledgeGraphVersionId)
        throw new RecommendationOperationError("课程尚未发布正式知识图谱", 409);
      if (
        course.currentPublishedKnowledgeGraphVersionId !== input.graphVersionId
      )
        throw new RecommendationOperationError(
          "正式知识图谱版本已变化，请刷新后重新配置",
          409,
        );
      if (
        course.currentTeachingProgressRevision?.inputFingerprint === fingerprint
      )
        return {
          id: course.currentTeachingProgressRevision.id,
          revisionNumber: course.currentTeachingProgressRevision.revisionNumber,
        };
      const currentRevision =
        course.currentTeachingProgressRevision?.revisionNumber ?? 0;
      if (currentRevision !== input.expectedRevision)
        throw new RecommendationOperationError(
          "教学进度已被其他页面修改，请刷新后重试",
          409,
        );
      const nodes = await transaction.publishedKnowledgeGraphNode.findMany({
        where: {
          graphVersionId: input.graphVersionId,
          conceptId: { in: input.conceptIds },
        },
        select: { id: true, conceptId: true },
      });
      if (nodes.length !== input.conceptIds.length)
        throw new RecommendationOperationError(
          "已授知识点必须全部来自当前正式图谱",
          400,
        );
      const revision = await transaction.courseTeachingProgressRevision.create({
        data: {
          courseId,
          graphVersionId: input.graphVersionId,
          createdById: teacherId,
          revisionNumber: currentRevision + 1,
          inputFingerprint: fingerprint,
          note: input.note,
          concepts: {
            create: nodes.map((node) => ({
              conceptId: node.conceptId,
              publishedNodeId: node.id,
            })),
          },
        },
        select: { id: true, revisionNumber: true },
      });
      await transaction.course.update({
        where: { id: courseId },
        data: { currentTeachingProgressRevisionId: revision.id },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.COURSE_TEACHING_PROGRESS_UPDATED,
        targetType: AuditTargetType.COURSE,
        targetId: courseId,
        summary: "更新课程已授知识点范围",
        beforeData: course.currentTeachingProgressRevision
          ? {
              revisionNumber:
                course.currentTeachingProgressRevision.revisionNumber,
              graphVersionId:
                course.currentTeachingProgressRevision.graphVersionId,
              conceptIds: course.currentTeachingProgressRevision.concepts.map(
                (item) => item.conceptId,
              ),
              note: course.currentTeachingProgressRevision.note,
            }
          : null,
        afterData: {
          revisionNumber: revision.revisionNumber,
          graphVersionId: input.graphVersionId,
          conceptIds: [...input.conceptIds].sort(),
          note: input.note ?? null,
        },
        context,
      });
      return revision;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
  return {
    ...(await getTeachingProgress(teacherId, courseId)),
    savedRevisionId: result.id,
  };
}

async function ensureDefaultPolicy(
  transaction: Prisma.TransactionClient,
  courseId: string,
  teacherId: string,
) {
  const course = await transaction.course.findUniqueOrThrow({
    where: { id: courseId },
    select: { currentRecommendationPolicyRevisionId: true },
  });
  if (course.currentRecommendationPolicyRevisionId)
    return transaction.courseRecommendationPolicyRevision.findUniqueOrThrow({
      where: { id: course.currentRecommendationPolicyRevisionId },
    });
  const fingerprint = courseRecommendationFingerprint({
    ruleVersion: COURSE_RECOMMENDATION_RULE_VERSION,
    ...DEFAULT_COURSE_RECOMMENDATION_POLICY,
  });
  const policy = await transaction.courseRecommendationPolicyRevision.upsert({
    where: {
      courseId_inputFingerprint: { courseId, inputFingerprint: fingerprint },
    },
    update: {},
    create: {
      courseId,
      createdById: teacherId,
      revisionNumber: 1,
      ruleVersion: COURSE_RECOMMENDATION_RULE_VERSION,
      inputFingerprint: fingerprint,
      ...DEFAULT_COURSE_RECOMMENDATION_POLICY,
    },
  });
  await transaction.course.update({
    where: { id: courseId },
    data: { currentRecommendationPolicyRevisionId: policy.id },
  });
  return policy;
}

export async function createCourseRecommendations(
  actor: AuthenticatedUser,
  courseId: string,
  input: CourseRecommendationGenerationInput,
  now = new Date(),
) {
  if (actor.role !== Role.STUDENT)
    throw new ResourceNotFoundError("课程或班级不存在");
  const context = await prisma.course.findFirst({
    where: {
      id: courseId,
      classrooms: {
        some: {
          id: input.classroomId,
          courseId,
          memberships: {
            some: { studentId: actor.id, status: MembershipStatus.ACTIVE },
          },
        },
      },
    },
    select: {
      id: true,
      teacherId: true,
      currentPublishedKnowledgeGraphVersion: {
        select: { id: true, versionNumber: true },
      },
      currentTeachingProgressRevision: {
        select: {
          id: true,
          revisionNumber: true,
          graphVersionId: true,
          inputFingerprint: true,
          concepts: {
            select: {
              conceptId: true,
              publishedNode: {
                select: { id: true, name: true, sortOrder: true },
              },
            },
          },
        },
      },
    },
  });
  if (!context) throw new ResourceNotFoundError("课程或班级不存在");
  const graph = context.currentPublishedKnowledgeGraphVersion;
  const progress = context.currentTeachingProgressRevision;
  if (!graph)
    throw new RecommendationOperationError("课程尚未发布正式知识图谱", 409);
  if (!progress || progress.graphVersionId !== graph.id)
    throw new RecommendationOperationError(
      "教师尚未为当前正式图谱配置教学进度",
      409,
    );
  const taughtConceptIds = new Set(
    progress.concepts.map((item) => item.conceptId),
  );
  const requestedConceptIds =
    input.conceptIds.length > 0 ? input.conceptIds : [...taughtConceptIds];
  if (requestedConceptIds.some((conceptId) => !taughtConceptIds.has(conceptId)))
    throw new RecommendationOperationError("练习知识点超出当前教学进度", 400);

  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);
  return prisma.$transaction(
    async (transaction) => {
      const policy = await ensureDefaultPolicy(
        transaction,
        courseId,
        context.teacherId,
      );
      if (input.count > policy.maxQuestionCount)
        throw new RecommendationOperationError(
          `单次最多推荐 ${policy.maxQuestionCount} 道题`,
          400,
        );
      const [profile, masteryState, recentAnswers, activeRecommendations] =
        await Promise.all([
          transaction.learnerProfileSnapshot.findFirst({
            where: { studentId: actor.id, courseId, graphVersionId: graph.id },
            orderBy: { revisionNumber: "desc" },
            select: {
              id: true,
              inputFingerprint: true,
              masteryRevisionId: true,
              concepts: {
                where: { conceptId: { in: requestedConceptIds } },
                select: {
                  conceptId: true,
                  evidenceState: true,
                  masteryScore: true,
                  evidenceCount: true,
                },
              },
            },
          }),
          transaction.studentCourseConceptMasteryState.findUnique({
            where: { studentId_courseId: { studentId: actor.id, courseId } },
            select: {
              revisions: {
                orderBy: { revisionNumber: "desc" },
                take: 1,
                select: { id: true, inputFingerprint: true },
              },
            },
          }),
          transaction.recommendationPracticeAnswer.findMany({
            where: {
              recommendation: {
                studentId: actor.id,
                courseCycle: { is: { courseId } },
              },
              createdAt: {
                gte: new Date(
                  now.getTime() - policy.recentWindowDays * 86_400_000,
                ),
              },
            },
            select: { questionId: true },
          }),
          transaction.personalizedRecommendation.findMany({
            where: {
              studentId: actor.id,
              status: {
                in: [
                  RecommendationStatus.PENDING,
                  RecommendationStatus.STARTED,
                ],
              },
              courseCycle: { is: { courseId } },
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { questionId: true },
          }),
        ]);
      const mastery = masteryState?.revisions[0] ?? null;
      const allowedTypes = input.questionTypes.length
        ? input.questionTypes
        : AUTO_GRADABLE_QUESTION_TYPES;
      const requestSnapshot = {
        courseId,
        classroomId: input.classroomId,
        conceptIds: [...requestedConceptIds].sort(),
        questionTypes: [...allowedTypes].sort(),
        count: input.count,
        difficulty: input.difficulty,
        graphVersionId: graph.id,
        profileSnapshotId: profile?.id ?? null,
        masteryRevisionId: mastery?.id ?? null,
        teachingProgressRevisionId: progress.id,
        policyRevisionId: policy.id,
        ruleVersion: policy.ruleVersion,
        generatedForDay: now.toISOString().slice(0, 10),
      };
      const inputFingerprint = courseRecommendationFingerprint(requestSnapshot);
      const existingCycle =
        await transaction.courseRecommendationCycle.findUnique({
          where: {
            studentId_courseId_inputFingerprint: {
              studentId: actor.id,
              courseId,
              inputFingerprint,
            },
          },
          select: { id: true },
        });
      if (existingCycle)
        return courseRecommendationCycleView(
          transaction,
          existingCycle.id,
          graph.versionNumber,
          progress.revisionNumber,
        );
      const excludedQuestionIds = [
        ...new Set([
          ...recentAnswers.map((item) => item.questionId),
          ...activeRecommendations.map((item) => item.questionId),
        ]),
      ];
      const minimumDifficulty = Math.max(
        1,
        input.difficulty - policy.difficultyTolerance,
      );
      const maximumDifficulty = Math.min(
        5,
        input.difficulty + policy.difficultyTolerance,
      );
      const questions = await transaction.question.findMany({
        where: {
          status: QuestionStatus.ACTIVE,
          deletedAt: null,
          explanation: { not: "" },
          type: { in: allowedTypes },
          difficulty: { gte: minimumDifficulty, lte: maximumDifficulty },
          ...(excludedQuestionIds.length
            ? { id: { notIn: excludedQuestionIds } }
            : {}),
          graphBindings: {
            some: {
              courseId,
              conceptId: { in: requestedConceptIds },
              concept: { nodes: { some: { graphVersionId: graph.id } } },
            },
          },
        },
        orderBy: { id: "asc" },
        take: 1000,
        select: {
          id: true,
          title: true,
          content: true,
          type: true,
          difficulty: true,
          graphBindings: {
            where: { courseId, conceptId: { in: requestedConceptIds } },
            orderBy: [{ bindingType: "asc" }, { conceptId: "asc" }],
            select: {
              conceptId: true,
              bindingType: true,
              sourceGraphVersionId: true,
              sourceNodeId: true,
              bindingSet: { select: { revision: true } },
              concept: {
                select: {
                  nodes: {
                    where: { graphVersionId: graph.id },
                    take: 1,
                    select: { id: true, name: true, sortOrder: true },
                  },
                },
              },
            },
          },
        },
      });
      const scored = rankCourseRecommendationCandidates({
        candidates: questions.map((question) => ({
          question,
          bindings: question.graphBindings
            .filter((binding) => binding.concept.nodes.length > 0)
            .map((binding) => ({
              conceptId: binding.conceptId,
              bindingType: binding.bindingType,
              conceptName: binding.concept.nodes[0]?.name ?? "课程知识点",
            })),
        })),
        profiles: (profile?.concepts ?? []).map((item) => ({
          conceptId: item.conceptId,
          evidenceState: item.evidenceState,
          masteryScore: item.masteryScore?.toNumber() ?? null,
        })),
        requestedDifficulty: input.difficulty,
        policy,
        limit: input.count,
      });
      if (!scored.length)
        throw new RecommendationOperationError(
          "当前教学范围内没有符合审核、解析、难度和去重条件的题目",
          422,
        );
      const cycleKey = `course-recommendation-v1:${inputFingerprint.slice(0, 32)}`;
      const cycle = await transaction.courseRecommendationCycle.create({
        data: {
          studentId: actor.id,
          courseId,
          classroomId: input.classroomId,
          graphVersionId: graph.id,
          profileSnapshotId: profile?.id ?? null,
          masteryRevisionId: mastery?.id ?? null,
          teachingProgressRevisionId: progress.id,
          policyRevisionId: policy.id,
          cycleKey,
          inputFingerprint,
          requestSnapshot,
          generatedAt: now,
          expiresAt,
        },
      });
      for (const item of scored) {
        const recommendation =
          await transaction.personalizedRecommendation.upsert({
            where: {
              studentId_questionId_cycleKey: {
                studentId: actor.id,
                questionId: item.question.id,
                cycleKey,
              },
            },
            update: {},
            create: {
              studentId: actor.id,
              questionId: item.question.id,
              courseCycleId: cycle.id,
              targetConceptId: item.targetConceptId,
              cycleKey,
              source: RecommendationSource.RULE,
              status: RecommendationStatus.PENDING,
              reason: item.reason,
              reasonCodes: item.reasonCodes,
              targetDifficulty: input.difficulty,
              priority: item.score,
              rankingScore: item.score,
              expiresAt,
            },
          });
        const snapshots = item.question.graphBindings.flatMap((binding) => {
          const resolvedNode = binding.concept.nodes[0];
          return resolvedNode
            ? [
                {
                  recommendationId: recommendation.id,
                  questionId: item.question.id,
                  courseId,
                  conceptId: binding.conceptId,
                  bindingType: binding.bindingType,
                  bindingSetRevision: binding.bindingSet.revision,
                  sourceGraphVersionId: binding.sourceGraphVersionId,
                  sourceNodeId: binding.sourceNodeId,
                  publishedGraphVersionId: graph.id,
                  resolvedNodeId: resolvedNode.id,
                  resolutionStatus: "RESOLVED" as const,
                },
              ]
            : [];
        });
        if (snapshots.length) {
          await transaction.courseRecommendationConceptSnapshot.createMany({
            data: snapshots,
            skipDuplicates: true,
          });
        }
      }
      return courseRecommendationCycleView(
        transaction,
        cycle.id,
        graph.versionNumber,
        progress.revisionNumber,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function courseRecommendationCycleView(
  transaction: Prisma.TransactionClient,
  cycleId: string,
  graphVersionNumber: number,
  teachingProgressRevisionNumber: number,
) {
  const cycle = await transaction.courseRecommendationCycle.findUniqueOrThrow({
    where: { id: cycleId },
    include: {
      policyRevision: { select: { ruleVersion: true } },
      recommendations: {
        orderBy: [{ priority: "desc" }, { id: "asc" }],
        select: {
          id: true,
          questionId: true,
          reason: true,
          reasonCodes: true,
          rankingScore: true,
          targetConceptId: true,
          status: true,
          question: {
            select: {
              title: true,
              content: true,
              type: true,
              difficulty: true,
            },
          },
        },
      },
    },
  });
  return {
    cycle: {
      id: cycle.id,
      cycleKey: cycle.cycleKey,
      courseId: cycle.courseId,
      graphVersionId: cycle.graphVersionId,
      graphVersionNumber,
      profileSnapshotId: cycle.profileSnapshotId,
      masteryRevisionId: cycle.masteryRevisionId,
      teachingProgressRevisionId: cycle.teachingProgressRevisionId,
      teachingProgressRevisionNumber,
      policyRevisionId: cycle.policyRevisionId,
      ruleVersion: cycle.policyRevision.ruleVersion,
      generatedAt: cycle.generatedAt,
      expiresAt: cycle.expiresAt,
    },
    items: cycle.recommendations.map((record) => ({
      ...record,
      rankingScore: record.rankingScore?.toNumber() ?? null,
    })),
  };
}
