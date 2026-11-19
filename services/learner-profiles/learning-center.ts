import "server-only";
import { studentKnowledgeStatus as conceptStatus } from "./knowledge-status";
import { learningCenterChapters } from "./knowledge-chapters";

import {
  LearnerProfileEvidenceState,
  LearningEventType,
  RecommendationStatus,
  SubmissionStatus,
  StudentSelfReflectionStatus,
} from "@prisma/client";

import { buildScoreTrend } from "./score-trend";
import {
  dimensionNumber,
  learningPriority,
  ratioPercent,
  shortDate,
} from "./learning-center-format";

import { prisma } from "@/lib/prisma";
import { CONCLUSIVE_EVIDENCE_COUNT } from "./constants";
import { getStudentPublishedKnowledgeGraph } from "@/services/knowledge-graph/service";
import { getStudentLearnerProfileView } from "@/services/learner-profiles/service";
import { getObjectiveMastery } from "@/services/learner-profiles/concept-objectives";

import { getStudentClassroomContext } from "@/services/courses/student-access";
import {
  growthRangeSince,
  type StudentGrowthRange,
} from "@/services/courses/student-workspace";

export async function getStudentCourseLearningCenter(
  studentId: string,
  courseId: string,
  classroomId?: string,
  view: "full" | "knowledge" | "activity" = "full",
  options: { range?: StudentGrowthRange } = {},
) {
  const range = options.range ?? "all";
  const since = growthRangeSince(range);
  const full = view === "full";
  const includeActivity = view !== "knowledge";
  const classroom = classroomId
    ? await getStudentClassroomContext(studentId, classroomId, courseId)
    : null;
  const [graphResult, profile] = await Promise.all([
    getStudentPublishedKnowledgeGraph(studentId, courseId),
    getStudentLearnerProfileView(studentId, courseId, {
      includeEvidence: false,
    }),
  ]);
  const [
    events,
    recommendations,
    profileHistory,
    confirmedReflections,
    submissions,
    practiceGroups,
  ] = await Promise.all([
    includeActivity
      ? prisma.learningEvent.findMany({
          where: {
            studentId,
            courseId,
            supersededBy: null,
            projectedEvidence: { none: { assignment: { status: "REVOKED" } } },
            eventType: {
              in: [
                LearningEventType.ASSESSMENT_GRADED,
                LearningEventType.RECOMMENDATION_PRACTICE_GRADED,
              ],
            },
          },
          orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
          take: 40,
          select: {
            id: true,
            occurredAt: true,
            eventType: true,
            sourceId: true,
            concepts: { select: { score: true, maxScore: true } },
          },
        })
      : [],
    full
      ? prisma.personalizedRecommendation.findMany({
          where: {
            studentId,
            courseCycle: {
              is: { courseId, ...(classroomId ? { classroomId } : {}) },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
          select: {
            id: true,
            status: true,
            createdAt: true,
            completedAt: true,
            wasCorrect: true,
          },
        })
      : [],
    includeActivity
      ? prisma.learnerProfileSnapshot.findMany({
          where: { studentId, courseId },
          orderBy: { revisionNumber: "desc" },
          take: 24,
          select: {
            revisionNumber: true,
            createdAt: true,
            objectiveMasteryDimension: true,
          },
        })
      : [],
    full
      ? prisma.studentSelfReflection.count({
          where: {
            studentId,
            courseId,
            status: StudentSelfReflectionStatus.CONFIRMED,
            deletedAt: null,
          },
        })
      : 0,
    full
      ? prisma.submission.findMany({
          where: {
            studentId,
            status: SubmissionStatus.PUBLISHED,
            assignment: {
              classroom: { courseId },
              ...(classroomId ? { classroomId } : {}),
            },
            score: { not: null },
            maxScore: { gt: 0 },
          },
          orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
          take: 16,
          select: {
            id: true,
            submittedAt: true,
            score: true,
            maxScore: true,
            percentage: true,
            assignment: {
              select: { title: true, classroom: { select: { name: true } } },
            },
          },
        })
      : [],
    full
      ? (async () => {
          const latestGroups = await prisma.personalizedRecommendation.groupBy({
            by: ["courseCycleId"],
            where: {
              studentId,
              courseCycle: {
                is: {
                  courseId,
                  ...(classroomId ? { classroomId } : {}),
                  recommendations: {
                    some: {},
                    every: {
                      status: RecommendationStatus.COMPLETED,
                      score: { not: null },
                      maxScore: { gt: 0 },
                      completedAt: { not: null },
                    },
                  },
                },
              },
            },
            _max: { completedAt: true },
            orderBy: { _max: { completedAt: "desc" } },
            take: 16,
          });
          return prisma.courseRecommendationCycle.findMany({
            where: {
              studentId,
              courseId,
              id: {
                in: latestGroups.flatMap((group) =>
                  group.courseCycleId ? [group.courseCycleId] : [],
                ),
              },
            },
            select: {
              id: true,
              classroom: { select: { name: true } },
              recommendations: {
                select: { completedAt: true, score: true, maxScore: true },
              },
            },
          });
        })()
      : [],
  ]);

  const published = graphResult.published;
  const structure = published?.structure ?? null;
  const conceptById = new Map(
    profile.concepts.map((concept) => [concept.conceptId, concept]),
  );
  const conceptIdByStableKey = new Map(
    published?.concepts.map((concept) => [
      concept.stableKey,
      concept.conceptId,
    ]) ?? [],
  );
  const knowledgePoints =
    structure?.nodes
      .filter((node) => node.type === "KNOWLEDGE_POINT")
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.code.localeCompare(right.code, "zh-CN", { numeric: true }),
      ) ?? [];
  const pointViews = knowledgePoints.map((node) => {
    const conceptId = conceptIdByStableKey.get(node.conceptKey) ?? null;
    const concept = conceptId ? (conceptById.get(conceptId) ?? null) : null;
    return {
      key: node.key,
      conceptId,
      code: node.code,
      name: node.name,
      isKeyTopic: node.isKeyTopic,
      isDifficultTopic: node.isDifficultTopic,
      evidenceState:
        concept?.evidenceState ?? LearnerProfileEvidenceState.NO_EVIDENCE,
      evidenceCount: concept?.evidenceCount ?? 0,
      confidence: concept?.confidence ?? 0,
      masteryScore: concept?.masteryScore ?? null,
      status: conceptStatus(concept),
    };
  });
  const pointByKey = new Map(pointViews.map((point) => [point.key, point]));
  const chapters = learningCenterChapters(structure, pointViews);
  const chapterPointViews = chapters.flatMap((chapter) => chapter.concepts);
  const chapterPointKeys = new Set(chapterPointViews.map((point) => point.key));
  const orderedPointViews = [
    ...chapterPointViews,
    ...pointViews.filter((point) => !chapterPointKeys.has(point.key)),
  ];

  const evidenceConcepts = orderedPointViews.filter(
    (point) => point.evidenceCount > 0,
  );
  const conclusive = evidenceConcepts.filter(
    (point) => point.evidenceState === LearnerProfileEvidenceState.CONCLUSIVE,
  );
  const mastered = conclusive.filter((point) => point.status === "MASTERED");
  const needsSupport = orderedPointViews.filter(
    (point) => point.status === "NEEDS_SUPPORT",
  );
  const insufficient = orderedPointViews.filter(
    (point) => point.status === "INSUFFICIENT",
  );
  const masteryAverage = conclusive.length
    ? Number(
        (
          conclusive.reduce(
            (sum, point) => sum + (point.masteryScore ?? 0),
            0,
          ) / conclusive.length
        ).toFixed(1),
      )
    : null;
  const scoreEventsAll = buildScoreTrend(
    [
      ...submissions.flatMap((submission) =>
        submission.submittedAt
          ? [
              {
                id: submission.id,
                occurredAt: submission.submittedAt,
                title: `${submission.assignment.title} · ${submission.assignment.classroom.name}`,
                source: "正式作业" as const,
                score: submission.score?.toNumber() ?? null,
                maxScore: submission.maxScore?.toNumber() ?? null,
                percentage: submission.percentage?.toNumber() ?? null,
              },
            ]
          : [],
      ),
      ...practiceGroups.map((group) => ({
        id: group.id,
        occurredAt: new Date(
          Math.max(
            ...group.recommendations.map(
              (item) => item.completedAt?.getTime() ?? 0,
            ),
          ),
        ),
        title: `${group.classroom.name} · ${group.recommendations.length} 道题`,
        source: "整组练习" as const,
        score: group.recommendations.reduce(
          (sum, item) => sum + (item.score?.toNumber() ?? 0),
          0,
        ),
        maxScore: group.recommendations.reduce(
          (sum, item) => sum + (item.maxScore?.toNumber() ?? 0),
          0,
        ),
      })),
    ],
    16,
  );
  const scoreEvents = (
    since
      ? scoreEventsAll.filter((event) => event.occurredAt >= since)
      : scoreEventsAll
  ).slice(-8);
  const recentAccuracy = scoreEvents.length
    ? Math.trunc(
        (scoreEvents.reduce((sum, event) => sum + event.value, 0) /
          scoreEvents.length) *
          100,
      ) / 100
    : null;
  const completedRecommendations = recommendations.filter(
    (item) => item.status === RecommendationStatus.COMPLETED,
  );
  const activeRecommendations = recommendations.filter(
    (item) =>
      item.status === RecommendationStatus.PENDING ||
      item.status === RecommendationStatus.STARTED,
  );
  const trackableRecommendations = recommendations.filter(
    (item) =>
      item.status === RecommendationStatus.PENDING ||
      item.status === RecommendationStatus.STARTED ||
      item.status === RecommendationStatus.COMPLETED,
  );
  const recommendationCompletion = ratioPercent(
    completedRecommendations.length,
    trackableRecommendations.length,
  );
  const attendanceRate = dimensionNumber(profile.dimensions.attendance, "rate");

  const prerequisiteGaps = new Map<string, string[]>();
  for (const point of evidenceConcepts.filter(
    (item) => item.status !== "MASTERED",
  )) {
    const missing = (structure?.edges ?? [])
      .filter((edge) => edge.type === "PREREQUISITE" && edge.to === point.key)
      .map((edge) => pointByKey.get(edge.from))
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== undefined && item.status !== "MASTERED",
      )
      .map((item) => item.name);
    if (missing.length) prerequisiteGaps.set(point.key, missing);
  }

  const currentLearningItems = evidenceConcepts
    .filter((point) => point.status !== "MASTERED")
    .sort(
      (left, right) =>
        learningPriority[left.status] - learningPriority[right.status] ||
        (left.masteryScore ?? Number.POSITIVE_INFINITY) -
          (right.masteryScore ?? Number.POSITIVE_INFINITY) ||
        orderedPointViews.indexOf(left) - orderedPointViews.indexOf(right),
    )
    .map((point) => ({
      ...point,
      prerequisiteGaps: prerequisiteGaps.get(point.key) ?? [],
    }));
  const currentFocus = currentLearningItems[0] ?? null;
  const evidenceGapForFocus = currentFocus
    ? Math.max(0, CONCLUSIVE_EVIDENCE_COUNT - currentFocus.evidenceCount)
    : 0;
  const nextAction = currentFocus
    ? currentFocus.prerequisiteGaps.length
      ? `先复习“${currentFocus.prerequisiteGaps[0]}”，再巩固“${currentFocus.name}”。`
      : evidenceGapForFocus > 0
        ? `再完成 ${evidenceGapForFocus} 道“${currentFocus.name}”相关题，就能形成掌握度结论。`
        : `可以再练几道“${currentFocus.name}”的题，看看掌握得怎么样。`
    : pointViews.length === 0
      ? "教师发布课程知识图谱后，这里会显示可以学习的内容。"
      : evidenceConcepts.length === 0
        ? "完成作业或练习、拿到评分后，这里会显示你的掌握情况。"
        : "目前有评分记录的知识点都已掌握，可以继续学习其他内容。";

  // 「按目标」只是换一个聚合维度，不改变掌握度口径；
  // 趋势页不需要目标维度，跳过这两次查询。
  const objectives =
    view === "activity"
      ? []
      : await getObjectiveMastery(courseId, orderedPointViews);

  /*
   * 学习记录条目要能点回现场。
   * 事件的 sourceId 是学生作答 ID（LearningEventSourceType.STUDENT_ANSWER），
   * 作答 → 提交 一跳即可，所以作业类可以直达「本次作业结果」；
   * 练习类的链路（recommendationAnswer → 推荐批次）没有对应的单次结果页，
   * 保持落到课程练习记录，不假装能直达。
   */
  const activityEvents = events.slice(0, 8);
  const answerIds = activityEvents
    .filter((event) => event.eventType === LearningEventType.ASSESSMENT_GRADED)
    .map((event) => event.sourceId);
  const answers = answerIds.length
    ? await prisma.studentAnswer.findMany({
        where: { id: { in: answerIds } },
        select: { id: true, submissionId: true },
      })
    : [];
  const submissionByAnswer = new Map(
    answers.map((answer) => [answer.id, answer.submissionId]),
  );
  const activityItems = activityEvents.map((event) => {
    const isAssessment =
      event.eventType === LearningEventType.ASSESSMENT_GRADED;
    const submissionId = isAssessment
      ? submissionByAnswer.get(event.sourceId)
      : undefined;
    return {
      id: event.id,
      occurredAt: event.occurredAt,
      kind: isAssessment ? ("assignment" as const) : ("practice" as const),
      label: isAssessment ? "作业评分已更新" : "练习结果已更新",
      conceptCount: event.concepts.length,
      /** 有提交 ID 才给直达链接；没有就退回课程列表，不造一个假链接。 */
      href: submissionId
        ? `/student/submissions/${submissionId}/result`
        : undefined,
    };
  });

  return {
    course: graphResult.course,
    classroom,
    graphVersion: published?.versionNumber ?? null,
    profileRevision: profile.revisionNumber,
    generatedAt: profile.generatedAt,
    summary: profile.summary,
    nextAction,
    overview: {
      totalConcepts: pointViews.length,
      evidenceConcepts: evidenceConcepts.length,
      conclusiveConcepts: conclusive.length,
      masteredConcepts: mastered.length,
      needsSupportConcepts: needsSupport.length,
      activeRecommendations: activeRecommendations.length,
      confirmedReflections,
    },
    progressSteps: [
      {
        key: "evidence-coverage",
        label: "有评分记录",
        numerator: evidenceConcepts.length,
        denominator: pointViews.length,
        value: ratioPercent(evidenceConcepts.length, pointViews.length),
        detail:
          pointViews.length === 0
            ? "教师发布课程知识图谱后就能查看"
            : "包含作业、考试和练习的评分",
      },
      {
        key: "stable-conclusions",
        label: "记录较充分",
        numerator: conclusive.length,
        denominator: evidenceConcepts.length,
        value: ratioPercent(conclusive.length, evidenceConcepts.length),
        detail:
          evidenceConcepts.length === 0
            ? "有了评分记录后，再看看掌握得怎样"
            : `每个知识点至少有 ${CONCLUSIVE_EVIDENCE_COUNT} 条评分记录`,
      },
      {
        key: "mastered-concepts",
        label: "已掌握",
        numerator: mastered.length,
        denominator: conclusive.length,
        value: ratioPercent(mastered.length, conclusive.length),
        detail:
          conclusive.length === 0
            ? "多做几道相关题后，再看掌握情况"
            : "掌握度达到 80%",
      },
    ],
    referenceIndicators: [
      {
        key: "objective-mastery",
        label: "平均掌握度",
        value: masteryAverage,
        detail: `${conclusive.length} 个知识点参与计算`,
      },
      {
        key: "recent-score-rate",
        label: "近期得分率",
        value: recentAccuracy,
        detail: `${scoreEvents.length} 组已完成评分（各组等权）`,
      },
      {
        key: "recommendation-completion",
        label: "推荐完成率",
        value: recommendationCompletion,
        detail: `${completedRecommendations.length}/${trackableRecommendations.length} 条有效推荐`,
      },
      {
        key: "attendance-rate",
        label: "出勤参与度",
        value: attendanceRate,
        detail:
          attendanceRate === null ? "暂无关闭的考勤记录" : "仅反映学习投入",
      },
    ],
    masteryTrend: [...profileHistory]
      .reverse()
      .filter((snapshot) => !since || snapshot.createdAt >= since)
      .map((snapshot) => {
        const value = dimensionNumber(
          snapshot.objectiveMasteryDimension,
          "conclusiveAverageMastery",
        );
        return value === null
          ? null
          : {
              at: snapshot.createdAt.toISOString(),
              label: shortDate(snapshot.createdAt),
              value,
              detail: `课程汇总 · 画像修订 #${snapshot.revisionNumber} · ${snapshot.createdAt.toLocaleString("zh-CN")} · 有足够评分记录 ${dimensionNumber(snapshot.objectiveMasteryDimension, "conclusiveConceptCount") ?? "—"}/${dimensionNumber(snapshot.objectiveMasteryDimension, "conceptCount") ?? "—"} 个知识点`,
            };
      })
      .filter((point): point is NonNullable<typeof point> => Boolean(point))
      .slice(-8),
    accuracyTrend: scoreEvents.map((event) => ({
      at: event.occurredAt.toISOString(),
      label: shortDate(event.occurredAt),
      value: event.value,
      detail: event.detail,
    })),
    recentActivity: activityItems,
    heatmap: chapters,
    objectives,
    learningPath: {
      mastered: orderedPointViews.filter(
        (point) => point.status === "MASTERED",
      ),
      current: currentLearningItems,
      next: orderedPointViews.filter((point) => point.evidenceCount === 0),
      needsSupport: needsSupport.slice(0, 6),
      insufficient: insufficient.slice(0, 6),
    },
  };
}

export type StudentCourseLearningCenter = Awaited<
  ReturnType<typeof getStudentCourseLearningCenter>
>;
