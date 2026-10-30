import "server-only";
import { runPracticeSerializable } from "@/services/recommendations/transactions";
import {
  practicePointAllocation,
  PRACTICE_SCORING_RULE,
} from "@/services/recommendations/scoring";
import { runAssignmentSerializable } from "@/services/assignments/transactions";
import { AssignmentOperationError } from "@/services/assignments/errors";
import { groupKnowledgeChapters } from "@/services/knowledge-graph/chapter-groups";

import {
  AuditAction,
  AuditTargetType,
  AssignmentStatus,
  MembershipStatus,
  Prisma,
  QuestionStatus,
  QuestionType,
  RecommendationSource,
  RecommendationStatus,
  Role,
} from "@prisma/client";

import { QUESTION_TYPE_LABELS } from "@/services/questions/constants";
import { expireStudentRecommendations } from "@/services/recommendations/repository";
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
import {
  currentPracticeProgress,
  requiresCompletePracticePaper,
} from "@/services/course-recommendations/practice-scope";
import type {
  CourseRecommendationGenerationInput,
  CourseRecommendationPolicyInput,
  CourseTeachingProgressInput,
} from "@/services/course-recommendations/schemas";
import { RecommendationOperationError } from "@/services/recommendations/errors";

function ownedCourseWhere(teacherId: string, courseId: string) {
  return { id: courseId, teacherId };
}

export async function getTeachingProgress(
  teacherId: string,
  courseId: string,
  classroomId?: string,
) {
  const course = await prisma.course.findFirst({
    where: ownedCourseWhere(teacherId, courseId),
    select: {
      id: true,
      classrooms: {
        where: { status: "ACTIVE", teacherId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      },
      currentPublishedKnowledgeGraphVersion: {
        select: {
          id: true,
          versionNumber: true,
          edges: {
            where: { relationType: "CONTAINS" },
            select: { fromNodeId: true, toNodeId: true },
          },
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
  if (classroomId && !course.classrooms.some((item) => item.id === classroomId))
    throw new ResourceNotFoundError("课程或班级不存在");
  const scoped = classroomId
    ? await prisma.courseTeachingProgressRevision.findFirst({
        where: { courseId, classroomId },
        orderBy: { revisionNumber: "desc" },
        select: {
          id: true,
          revisionNumber: true,
          graphVersionId: true,
          note: true,
          createdAt: true,
          concepts: { select: { conceptId: true, publishedNodeId: true } },
        },
      })
    : null;
  return {
    classroomId: classroomId ?? null,
    classrooms: course.classrooms,
    inherited: Boolean(
      classroomId && !scoped && course.currentTeachingProgressRevision,
    ),
    chapters: groupKnowledgeChapters(
      course.currentPublishedKnowledgeGraphVersion?.nodes ?? [],
      course.currentPublishedKnowledgeGraphVersion?.edges ?? [],
    ),
    graphVersion: course.currentPublishedKnowledgeGraphVersion
      ? {
          id: course.currentPublishedKnowledgeGraphVersion.id,
          versionNumber:
            course.currentPublishedKnowledgeGraphVersion.versionNumber,
        }
      : null,
    revision: scoped ?? course.currentTeachingProgressRevision,
    nodes: course.currentPublishedKnowledgeGraphVersion?.nodes ?? [],
  };
}

export async function listStudentPracticeCourses(studentId: string) {
  const memberships = await prisma.classMembership.findMany({
    where: {
      studentId,
      status: MembershipStatus.ACTIVE,
      classroom: { status: "ACTIVE", courseId: { not: null } },
    },
    orderBy: { joinedAt: "desc" },
    select: {
      classroom: {
        select: {
          id: true,
          name: true,
          course: {
            select: {
              id: true,
              name: true,
              currentPublishedKnowledgeGraphVersion: {
                select: {
                  versionNumber: true,
                  nodes: {
                    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                    select: {
                      id: true,
                      conceptId: true,
                      code: true,
                      name: true,
                      nodeType: true,
                      outgoingEdges: {
                        where: { relationType: "CONTAINS" },
                        select: {
                          toNode: {
                            select: { conceptId: true, nodeType: true },
                          },
                        },
                      },
                    },
                  },
                },
              },
              currentTeachingProgressRevision: {
                select: {
                  revisionNumber: true,
                  concepts: {
                    orderBy: { publishedNode: { sortOrder: "asc" } },
                    select: {
                      conceptId: true,
                      publishedNode: { select: { code: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const scopedRevisions = await prisma.courseTeachingProgressRevision.findMany({
    where: {
      classroomId: { in: memberships.map((item) => item.classroom.id) },
    },
    orderBy: { revisionNumber: "desc" },
    include: { concepts: { include: { publishedNode: true } } },
  });
  return memberships.flatMap(({ classroom }) =>
    classroom.course
      ? [
          {
            courseId: classroom.course.id,
            courseName: classroom.course.name,
            classroomId: classroom.id,
            classroomName: classroom.name,
            graphVersionNumber:
              classroom.course.currentPublishedKnowledgeGraphVersion
                ?.versionNumber ?? null,
            progressRevisionNumber:
              (
                scopedRevisions.find(
                  (item) =>
                    item.classroomId === classroom.id &&
                    item.courseId === classroom.course?.id,
                ) ?? classroom.course.currentTeachingProgressRevision
              )?.revisionNumber ?? null,
            concepts: (
              classroom.course.currentPublishedKnowledgeGraphVersion?.nodes.filter(
                (node) => node.nodeType === "KNOWLEDGE_POINT",
              ) ?? []
            ).map((item) => ({
              id: item.conceptId,
              code: item.code,
              name: item.name,
            })),
            chapters: (
              classroom.course.currentPublishedKnowledgeGraphVersion?.nodes ??
              []
            )
              .filter((node) => node.nodeType === "CHAPTER")
              .map((chapter) => ({
                id: chapter.id,
                code: chapter.code,
                name: chapter.name,
                conceptIds: chapter.outgoingEdges
                  .filter((edge) => edge.toNode.nodeType === "KNOWLEDGE_POINT")
                  .map((edge) => edge.toNode.conceptId),
              }))
              .filter((chapter) => chapter.conceptIds.length > 0),
          },
        ]
      : [],
  );
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
    ...(input.classroomId ? { classroomId: input.classroomId } : {}),
  });
  const result = await runAssignmentSerializable(async (transaction) => {
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
    if (
      input.classroomId &&
      !(await transaction.classroom.findFirst({
        where: {
          id: input.classroomId,
          courseId,
          teacherId,
          status: "ACTIVE",
        },
        select: { id: true },
      }))
    )
      throw new ResourceNotFoundError("课程或班级不存在");
    const scoped = input.classroomId
      ? await transaction.courseTeachingProgressRevision.findFirst({
          where: { courseId, classroomId: input.classroomId },
          orderBy: { revisionNumber: "desc" },
          include: { concepts: { select: { conceptId: true } } },
        })
      : null;
    const current = scoped ?? course.currentTeachingProgressRevision;
    if (!course.currentPublishedKnowledgeGraphVersionId)
      throw new RecommendationOperationError("课程尚未发布正式知识图谱", 409);
    if (course.currentPublishedKnowledgeGraphVersionId !== input.graphVersionId)
      throw new RecommendationOperationError(
        "正式知识图谱版本已变化，请刷新后重新配置",
        409,
      );
    if (current?.inputFingerprint === fingerprint)
      return {
        id: current.id,
        revisionNumber: current.revisionNumber,
      };
    const currentRevision = current?.revisionNumber ?? 0;
    if (currentRevision !== input.expectedRevision)
      throw new RecommendationOperationError(
        "教学进度已被其他页面修改，请刷新后重试",
        409,
      );
    const nodes = await transaction.publishedKnowledgeGraphNode.findMany({
      where: {
        graphVersionId: input.graphVersionId,
        conceptId: { in: input.conceptIds },
        nodeType: "KNOWLEDGE_POINT",
      },
      select: { id: true, conceptId: true },
    });
    if (nodes.length !== input.conceptIds.length)
      throw new RecommendationOperationError(
        "已授知识点必须全部来自当前正式图谱",
        400,
      );
    const latest = await transaction.courseTeachingProgressRevision.aggregate({
      where: { courseId },
      _max: { revisionNumber: true },
    });
    const revision = await transaction.courseTeachingProgressRevision.create({
      data: {
        courseId,
        classroomId: input.classroomId,
        graphVersionId: input.graphVersionId,
        createdById: teacherId,
        revisionNumber: (latest._max.revisionNumber ?? 0) + 1,
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
    if (!input.classroomId)
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
      beforeData: current
        ? {
            revisionNumber: current.revisionNumber,
            graphVersionId: current.graphVersionId,
            conceptIds: current.concepts.map((item) => item.conceptId),
            note: current.note,
          }
        : null,
      afterData: {
        classroomId: input.classroomId ?? null,
        revisionNumber: revision.revisionNumber,
        graphVersionId: input.graphVersionId,
        conceptIds: [...input.conceptIds].sort(),
        note: input.note ?? null,
      },
      context,
    });
    return revision;
  }, "教学进度正在被其他页面更新，请刷新后重试").catch((error: unknown) => {
    if (error instanceof AssignmentOperationError)
      throw new RecommendationOperationError(error.message, 409);
    throw error;
  });
  return {
    ...(await getTeachingProgress(teacherId, courseId, input.classroomId)),
    savedRevisionId: result.id,
  };
}

export async function getRecommendationPolicy(
  teacherId: string,
  courseId: string,
) {
  const course = await prisma.course.findFirst({
    where: ownedCourseWhere(teacherId, courseId),
    select: { currentRecommendationPolicyRevision: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  return (
    course.currentRecommendationPolicyRevision ?? {
      id: null,
      revisionNumber: 0,
      ruleVersion: COURSE_RECOMMENDATION_RULE_VERSION,
      ...DEFAULT_COURSE_RECOMMENDATION_POLICY,
    }
  );
}

export async function updateRecommendationPolicy(
  teacherId: string,
  courseId: string,
  input: CourseRecommendationPolicyInput,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      const course = await transaction.course.findFirst({
        where: ownedCourseWhere(teacherId, courseId),
        select: { currentRecommendationPolicyRevision: true },
      });
      if (!course) throw new ResourceNotFoundError("课程不存在");
      const currentRevision =
        course.currentRecommendationPolicyRevision?.revisionNumber ?? 0;
      if (input.expectedRevision !== currentRevision)
        throw new RecommendationOperationError(
          "推荐策略已被其他页面修改，请刷新后重试",
          409,
        );
      const values = {
        weaknessWeight: input.weaknessWeight,
        prerequisiteWeight: input.prerequisiteWeight,
        difficultyWeight: input.difficultyWeight,
        errorPatternWeight: input.errorPatternWeight,
        freshnessWeight: input.freshnessWeight,
        teacherPriorityWeight: input.teacherPriorityWeight,
        recentWindowDays: input.recentWindowDays,
        difficultyTolerance: input.difficultyTolerance,
        maxQuestionCount: input.maxQuestionCount,
      };
      const inputFingerprint = courseRecommendationFingerprint({
        ruleVersion: COURSE_RECOMMENDATION_RULE_VERSION,
        ...values,
      });
      const existing =
        await transaction.courseRecommendationPolicyRevision.findUnique({
          where: { courseId_inputFingerprint: { courseId, inputFingerprint } },
        });
      const revision =
        existing ??
        (await transaction.courseRecommendationPolicyRevision.create({
          data: {
            courseId,
            createdById: teacherId,
            revisionNumber: currentRevision + 1,
            ruleVersion: COURSE_RECOMMENDATION_RULE_VERSION,
            inputFingerprint,
            ...values,
          },
        }));
      await transaction.course.update({
        where: { id: courseId },
        data: { currentRecommendationPolicyRevisionId: revision.id },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.COURSE_RECOMMENDATION_POLICY_UPDATED,
        targetType: AuditTargetType.COURSE,
        targetId: courseId,
        summary: "更新课程推荐策略",
        beforeData: course.currentRecommendationPolicyRevision
          ? {
              revisionNumber:
                course.currentRecommendationPolicyRevision.revisionNumber,
              weaknessWeight:
                course.currentRecommendationPolicyRevision.weaknessWeight,
              prerequisiteWeight:
                course.currentRecommendationPolicyRevision.prerequisiteWeight,
              difficultyWeight:
                course.currentRecommendationPolicyRevision.difficultyWeight,
              errorPatternWeight:
                course.currentRecommendationPolicyRevision.errorPatternWeight,
              freshnessWeight:
                course.currentRecommendationPolicyRevision.freshnessWeight,
              teacherPriorityWeight:
                course.currentRecommendationPolicyRevision
                  .teacherPriorityWeight,
            }
          : null,
        afterData: { revisionNumber: revision.revisionNumber, ...values },
        context,
      });
      return revision;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
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

type PracticeQuestionDistribution = Partial<Record<QuestionType, number>>;

function normalizedQuestionDistribution(
  raw: Partial<Record<QuestionType, number>>,
  total: number,
): PracticeQuestionDistribution {
  const entries = Object.entries(raw).filter(
    (entry): entry is [QuestionType, number] =>
      entry[1] !== undefined && entry[1] > 0,
  );
  const sourceTotal = entries.reduce((sum, [, count]) => sum + count, 0);
  if (sourceTotal === 0) return {};
  const scaled = entries.map(([type, count]) => {
    const exact = (count / sourceTotal) * total;
    return { type, count: Math.floor(exact), remainder: exact % 1 };
  });
  let remaining = total - scaled.reduce((sum, item) => sum + item.count, 0);
  for (const item of [...scaled].sort(
    (left, right) => right.remainder - left.remainder,
  )) {
    if (remaining <= 0) break;
    item.count += 1;
    remaining -= 1;
  }
  return Object.fromEntries(
    scaled
      .filter((item) => item.count > 0)
      .map((item) => [item.type, item.count]),
  );
}

const DEFAULT_TEST_QUESTION_DISTRIBUTION: PracticeQuestionDistribution = {
  [QuestionType.SINGLE_CHOICE]: 20,
  [QuestionType.MULTIPLE_CHOICE]: 10,
  [QuestionType.TRUE_FALSE]: 10,
  [QuestionType.FILL_BLANK]: 5,
  [QuestionType.PYTHON_PROGRAMMING]: 5,
};

export async function createCourseRecommendations(
  actor: AuthenticatedUser,
  courseId: string,
  input: CourseRecommendationGenerationInput,
  now = new Date(),
  favorite?: { favoriteId: string; questionId: string; requestId: string },
) {
  if (actor.role !== Role.STUDENT)
    throw new ResourceNotFoundError("课程或班级不存在");
  if (favorite) {
    const ownedFavorite = await prisma.studentQuestionFavorite.findFirst({
      where: {
        id: favorite.favoriteId,
        studentId: actor.id,
        courseId,
        questionId: favorite.questionId,
      },
      select: { id: true },
    });
    if (!ownedFavorite) throw new ResourceNotFoundError("收藏不存在");
  }
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
      questionCategoryId: true,
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
  const latestProgress =
    (await prisma.courseTeachingProgressRevision.findFirst({
      where: { courseId, classroomId: input.classroomId },
      orderBy: { revisionNumber: "desc" },
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
    })) ?? context.currentTeachingProgressRevision;
  const chapterIds = input.chapterIds ?? [];
  if (!graph)
    throw new RecommendationOperationError("课程尚未发布正式知识图谱", 409);
  // Teaching progress remains provenance when applicable, never a gate for
  // student-initiated practice in the current published graph.
  const progress = currentPracticeProgress(graph.id, latestProgress);
  const graphConceptNodes = await prisma.publishedKnowledgeGraphNode.findMany({
    where: { graphVersionId: graph.id, nodeType: "KNOWLEDGE_POINT" },
    select: { conceptId: true },
  });
  const graphConceptIds = new Set(
    graphConceptNodes.map((node) => node.conceptId),
  );
  const selectedChapters = chapterIds.length
    ? await prisma.publishedKnowledgeGraphNode.findMany({
        where: {
          id: { in: chapterIds },
          graphVersionId: graph.id,
          nodeType: "CHAPTER",
        },
        select: {
          id: true,
          outgoingEdges: {
            where: { relationType: "CONTAINS" },
            select: {
              toNode: { select: { conceptId: true, nodeType: true } },
            },
          },
        },
      })
    : [];
  if (selectedChapters.length !== chapterIds.length)
    throw new RecommendationOperationError(
      "所选章节不属于当前课程正式图谱",
      400,
    );
  const chapterConceptIds = selectedChapters.flatMap((chapter) =>
    chapter.outgoingEdges
      .filter((edge) => edge.toNode.nodeType === "KNOWLEDGE_POINT")
      .map((edge) => edge.toNode.conceptId),
  );
  const requestedConceptIds = [
    ...new Set(
      chapterIds.length
        ? chapterConceptIds
        : input.conceptIds.length
          ? input.conceptIds
          : [...graphConceptIds],
    ),
  ];
  if (chapterIds.length && !requestedConceptIds.length)
    throw new RecommendationOperationError("所选章节下没有可练习的知识点", 400);
  if (requestedConceptIds.some((conceptId) => !graphConceptIds.has(conceptId)))
    throw new RecommendationOperationError(
      "练习知识点不属于当前正式课程图谱",
      400,
    );

  const expiresAt = new Date(now);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 7);
  await expireStudentRecommendations(actor.id, now);
  return runPracticeSerializable(
    async (transaction) => {
      const policy = await ensureDefaultPolicy(
        transaction,
        courseId,
        context.teacherId,
      );
      if (!input.template && input.count > policy.maxQuestionCount)
        throw new RecommendationOperationError(
          `单次最多推荐 ${policy.maxQuestionCount} 道题`,
          400,
        );
      const [
        profile,
        masteryState,
        recentAnswers,
        activeRecommendations,
        prerequisiteEdges,
      ] = await Promise.all([
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
              in: [RecommendationStatus.PENDING, RecommendationStatus.STARTED],
            },
            // 活跃题目唯一约束跨旧版推荐与课程推荐，去重范围必须一致。
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { questionId: true },
        }),
        transaction.publishedKnowledgeGraphEdge.findMany({
          where: {
            graphVersionId: graph.id,
            relationType: "PREREQUISITE",
            toNode: { conceptId: { in: requestedConceptIds } },
          },
          select: {
            fromNode: { select: { conceptId: true } },
            toNode: { select: { conceptId: true } },
          },
        }),
      ]);
      const mastery = masteryState?.revisions[0] ?? null;
      let typeDistribution: PracticeQuestionDistribution;
      if (input.template === "MIXED_TEST50") {
        const previousTest = await transaction.assignment.findFirst({
          where: {
            teacherId: context.teacherId,
            status: {
              in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED],
            },
            classroom: {
              courseId,
              OR: [
                { name: { contains: "测验" } },
                { name: { contains: "测试" } },
                { name: { contains: "考试" } },
                { name: { contains: "test", mode: "insensitive" } },
                { name: { contains: "exam", mode: "insensitive" } },
              ],
            },
          },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          select: {
            questions: { select: { typeSnapshot: true } },
          },
        });
        const historicalCounts: PracticeQuestionDistribution = {};
        for (const item of previousTest?.questions ?? []) {
          if (
            AUTO_GRADABLE_QUESTION_TYPES.some(
              (type) => type === item.typeSnapshot,
            ) ||
            item.typeSnapshot === QuestionType.PYTHON_PROGRAMMING
          ) {
            historicalCounts[item.typeSnapshot] =
              (historicalCounts[item.typeSnapshot] ?? 0) + 1;
          }
        }
        typeDistribution = normalizedQuestionDistribution(historicalCounts, 50);
        if (!Object.keys(typeDistribution).length)
          typeDistribution = DEFAULT_TEST_QUESTION_DISTRIBUTION;
      } else if (input.template === "TRUE_FALSE10") {
        typeDistribution = {
          [QuestionType.TRUE_FALSE]: input.practiceCount ?? 10,
        };
      } else if (input.template === "PYTHON5") {
        typeDistribution = {
          [QuestionType.PYTHON_PROGRAMMING]: input.practiceCount ?? 5,
        };
      } else if (input.template === "CHOICE20") {
        typeDistribution = normalizedQuestionDistribution(
          {
            [QuestionType.SINGLE_CHOICE]: 15,
            [QuestionType.MULTIPLE_CHOICE]: 5,
          },
          input.practiceCount ?? 20,
        );
      } else {
        const legacyTypes = input.questionTypes.length
          ? input.questionTypes
          : [...AUTO_GRADABLE_QUESTION_TYPES, QuestionType.PYTHON_PROGRAMMING];
        typeDistribution = normalizedQuestionDistribution(
          Object.fromEntries(legacyTypes.map((type) => [type, 1])),
          input.count,
        );
      }
      const targetCount = Object.values(typeDistribution).reduce(
        (sum, count) => sum + (count ?? 0),
        0,
      );
      const allowedTypes = Object.keys(typeDistribution) as QuestionType[];
      const requestSnapshot = {
        ...(favorite ? { favoriteReview: favorite } : {}),
        courseId,
        classroomId: input.classroomId,
        mode: input.mode ?? "PRACTICE",
        template: input.template ?? "CUSTOM",
        chapterIds: chapterIds.toSorted(),
        typeDistribution,
        conceptIds: [...requestedConceptIds].sort(),
        questionTypes: [...allowedTypes].sort(),
        count: targetCount,
        difficulty: input.difficulty,
        graphVersionId: graph.id,
        profileSnapshotId: profile?.id ?? null,
        masteryRevisionId: mastery?.id ?? null,
        scopeMode: "SELF_PRACTICE_FULL_GRAPH",
        teachingProgressRevisionId: progress?.id ?? null,
        policyRevisionId: policy.id,
        ruleVersion: policy.ruleVersion,
        generatedForDay: now.toISOString().slice(0, 10),
      };
      const inputFingerprint = courseRecommendationFingerprint(
        input.requestId
          ? {
              studentId: actor.id,
              courseId,
              ...input,
              conceptIds: [...input.conceptIds].sort(),
              chapterIds: [...(input.chapterIds ?? [])].sort(),
              questionTypes: [...input.questionTypes].sort(),
              ...(favorite ? { favoriteReview: favorite } : {}),
            }
          : requestSnapshot,
      );
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
          progress?.revisionNumber ?? null,
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
          isAssignmentOnly: false,
          deletedAt: null,
          questionCategoryId: context.questionCategoryId,
          explanation: { not: "" },
          type: { in: allowedTypes },
          difficulty: { gte: minimumDifficulty, lte: maximumDifficulty },
          ...(favorite
            ? { id: favorite.questionId }
            : excludedQuestionIds.length
              ? { id: { notIn: excludedQuestionIds } }
              : {}),
          graphBindings: {
            some: {
              courseId,
              conceptId: { in: requestedConceptIds },
              concept: { nodes: { some: { graphVersionId: graph.id } } },
            },
          },
          ...(allowedTypes.includes(QuestionType.PYTHON_PROGRAMMING)
            ? {
                AND: [
                  {
                    OR: [
                      { type: { not: QuestionType.PYTHON_PROGRAMMING } },
                      { programmingConfigRevisions: { some: {} } },
                    ],
                  },
                ],
              }
            : {}),
        },
        orderBy: { id: "asc" },
        take: 1000,
        select: {
          id: true,
          creatorId: true,
          title: true,
          content: true,
          type: true,
          difficulty: true,
          tags: true,
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
                    select: {
                      id: true,
                      name: true,
                      sortOrder: true,
                      importance: true,
                    },
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
          prerequisiteGap: question.graphBindings.some((binding) =>
            prerequisiteEdges.some(
              (edge) =>
                edge.toNode.conceptId === binding.conceptId &&
                !profile?.concepts.some(
                  (item) =>
                    item.conceptId === edge.fromNode.conceptId &&
                    (item.masteryScore?.toNumber() ?? 0) >= 80,
                ),
            ),
          ),
          recentErrorMatch: question.graphBindings.some((binding) =>
            profile?.concepts.some(
              (item) =>
                item.conceptId === binding.conceptId &&
                item.evidenceState === "CONCLUSIVE" &&
                (item.masteryScore?.toNumber() ?? 100) < 50,
            ),
          ),
          teacherPriority: question.tags.includes("teacher-priority"),
          coreImportance: question.graphBindings.some((binding) =>
            binding.concept.nodes.some((node) => node.importance === "CORE"),
          ),
        })),
        profiles: (profile?.concepts ?? []).map((item) => ({
          conceptId: item.conceptId,
          evidenceState: item.evidenceState,
          masteryScore: item.masteryScore?.toNumber() ?? null,
        })),
        requestedDifficulty: input.difficulty,
        policy,
        limit: 1000,
      });
      const selectedQuestions = allowedTypes.flatMap((type) =>
        scored
          .filter((item) => item.question.type === type)
          .slice(0, typeDistribution[type] ?? 0),
      );
      if (!selectedQuestions.length)
        throw new RecommendationOperationError(
          "当前知识点或章节暂无符合题型、难度和去重条件的已审核题目；请调整题型或难度后重试",
          422,
        );
      if (
        selectedQuestions.length !== targetCount &&
        requiresCompletePracticePaper(input.mode)
      ) {
        const missing = allowedTypes
          .map((type) => {
            const expected = typeDistribution[type] ?? 0;
            const available = scored.filter(
              (item) => item.question.type === type,
            ).length;
            return expected > available
              ? `${QUESTION_TYPE_LABELS[type]}还缺 ${expected - available} 道`
              : null;
          })
          .filter((item): item is string => item !== null)
          .join("、");
        throw new RecommendationOperationError(
          `当前章节的本课程分类共享题库题目不足以组成完整试卷（${selectedQuestions.length}/${targetCount}）；${missing}`,
          422,
        );
      }
      const cycleKey = `course-recommendation-v1:${inputFingerprint.slice(0, 32)}`;
      const cycle = await transaction.courseRecommendationCycle.create({
        data: {
          studentId: actor.id,
          courseId,
          classroomId: input.classroomId,
          graphVersionId: graph.id,
          profileSnapshotId: profile?.id ?? null,
          masteryRevisionId: mastery?.id ?? null,
          teachingProgressRevisionId: progress?.id ?? null,
          policyRevisionId: policy.id,
          cycleKey,
          inputFingerprint,
          requestSnapshot,
          generatedAt: now,
          expiresAt,
        },
      });
      const assignedPoints = practicePointAllocation(selectedQuestions.length);
      for (const [index, item] of selectedQuestions.entries()) {
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
              assignedPoints: assignedPoints[index],
              scoringRuleVersion: PRACTICE_SCORING_RULE,
              targetConceptId: item.targetConceptId,
              cycleKey,
              source: RecommendationSource.RULE,
              status: RecommendationStatus.PENDING,
              reason: favorite
                ? "你主动收藏的题目，用于自主复习；本次作答不计入正式课程成绩。"
                : item.reason,
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
        progress?.revisionNumber ?? null,
      );
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function courseRecommendationCycleView(
  transaction: Prisma.TransactionClient,
  cycleId: string,
  graphVersionNumber: number,
  teachingProgressRevisionNumber: number | null,
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
          assignedPoints: true,
          scoringRuleVersion: true,
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
      assignedPoints: record.assignedPoints?.toNumber() ?? null,
    })),
    scoringSummary: {
      totalPoints: cycle.recommendations.every(
        (record) => record.assignedPoints !== null,
      )
        ? cycle.recommendations.reduce(
            (sum, record) =>
              sum + Math.round((record.assignedPoints?.toNumber() ?? 0) * 100),
            0,
          ) / 100
        : null,
      actualCount: cycle.recommendations.length,
      ruleVersion: cycle.recommendations[0]?.scoringRuleVersion ?? null,
    },
  };
}

export async function getStudentPracticeSession(
  studentId: string,
  cycleId: string,
) {
  const cycle = await prisma.courseRecommendationCycle.findFirst({
    where: { id: cycleId, studentId },
    select: {
      id: true,
      requestSnapshot: true,
      generatedAt: true,
      course: { select: { id: true, name: true } },
      classroom: { select: { name: true } },
      graphVersion: { select: { versionNumber: true } },
      recommendations: {
        orderBy: [{ priority: "desc" }, { id: "asc" }],
        select: {
          id: true,
          status: true,
          reason: true,
          wasCorrect: true,
          score: true,
          maxScore: true,
          practiceAnswer: {
            select: { score: true, maxScore: true, isCorrect: true },
          },
          programmingAttempts: {
            orderBy: [{ revisionNumber: "desc" }, { id: "desc" }],
            take: 1,
            select: {
              id: true,
              status: true,
              score: true,
              maxScore: true,
              backgroundJob: { select: { progress: true } },
            },
          },
          question: {
            select: {
              id: true,
              title: true,
              content: true,
              type: true,
              difficulty: true,
              explanation: true,
              options: {
                orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  label: true,
                  content: true,
                  sortOrder: true,
                },
              },
              programmingConfigRevisions: {
                orderBy: { revisionNumber: "desc" },
                take: 1,
                select: { starterCode: true },
              },
            },
          },
        },
      },
    },
  });
  if (!cycle) throw new ResourceNotFoundError("练习或测试不存在");
  const snapshot = cycle.requestSnapshot;
  const rawDistribution =
    typeof snapshot === "object" &&
    snapshot !== null &&
    !Array.isArray(snapshot) &&
    typeof snapshot.typeDistribution === "object" &&
    snapshot.typeDistribution !== null &&
    !Array.isArray(snapshot.typeDistribution)
      ? snapshot.typeDistribution
      : {};
  const mode =
    typeof snapshot === "object" &&
    snapshot !== null &&
    !Array.isArray(snapshot)
      ? snapshot.mode === "TEST"
        ? "TEST"
        : "PRACTICE"
      : "PRACTICE";
  return {
    id: cycle.id,
    course: cycle.course,
    classroomName: cycle.classroom.name,
    graphVersionNumber: cycle.graphVersion.versionNumber,
    generatedAt: cycle.generatedAt.toISOString(),
    mode,
    requestedCount:
      typeof snapshot === "object" &&
      snapshot !== null &&
      !Array.isArray(snapshot) &&
      typeof snapshot.count === "number"
        ? snapshot.count
        : cycle.recommendations.length,
    questionDistribution: Object.fromEntries(
      Object.entries(rawDistribution).filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" && Number.isInteger(entry[1]),
      ),
    ),
    items: cycle.recommendations.map((item) => ({
      id: item.id,
      status: item.status,
      reason: item.reason,
      wasCorrect: item.practiceAnswer?.isCorrect ?? item.wasCorrect,
      score:
        item.practiceAnswer?.score.toNumber() ?? item.score?.toNumber() ?? null,
      maxScore:
        item.practiceAnswer?.maxScore.toNumber() ??
        item.maxScore?.toNumber() ??
        1,
      programmingAttempt: item.programmingAttempts[0]
        ? {
            id: item.programmingAttempts[0].id,
            status: item.programmingAttempts[0].status,
            score: item.programmingAttempts[0].score?.toNumber() ?? null,
            progress: item.programmingAttempts[0].backgroundJob?.progress ?? 0,
          }
        : null,
      question: {
        ...item.question,
        starterCode:
          item.question.programmingConfigRevisions[0]?.starterCode ?? "",
      },
    })),
  };
}
