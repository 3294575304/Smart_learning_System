import "server-only";

import {
  LearnerProfileEvidenceState,
  LearningEventType,
  RecommendationStatus,
  SubmissionStatus,
  QuestionStatus,
  QuestionVisibility,
  StudentSelfReflectionStatus,
} from "@prisma/client";

import { buildScoreTrend } from "./score-trend";

import { prisma } from "@/lib/prisma";
import { listStudentPracticeCourses } from "@/services/course-recommendations/service";
import { getStudentPublishedKnowledgeGraph } from "@/services/knowledge-graph/service";
import { getStudentLearnerProfile } from "@/services/learner-profiles/service";

import { getStudentClassroomContext } from "@/services/courses/student-access";

type ConceptStatus =
  "MASTERED" | "DEVELOPING" | "NEEDS_SUPPORT" | "INSUFFICIENT" | "NO_EVIDENCE";

function dimensionNumber(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "number" && Number.isFinite(candidate)
    ? candidate
    : null;
}

function conceptStatus(
  concept: {
    evidenceState: LearnerProfileEvidenceState;
    masteryScore: number | null;
  } | null,
): ConceptStatus {
  if (
    !concept ||
    concept.evidenceState === LearnerProfileEvidenceState.NO_EVIDENCE
  )
    return "NO_EVIDENCE";
  if (
    concept.evidenceState ===
      LearnerProfileEvidenceState.INSUFFICIENT_EVIDENCE ||
    concept.masteryScore === null
  )
    return "INSUFFICIENT";
  if (concept.masteryScore >= 80) return "MASTERED";
  if (concept.masteryScore >= 60) return "DEVELOPING";
  return "NEEDS_SUPPORT";
}

function shortDate(date: Date) {
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function ratioPercent(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

const learningPriority: Record<ConceptStatus, number> = {
  NEEDS_SUPPORT: 0,
  DEVELOPING: 1,
  INSUFFICIENT: 2,
  NO_EVIDENCE: 3,
  MASTERED: 4,
};

export async function getStudentCourseLearningCenter(
  studentId: string,
  courseId: string,
  classroomId?: string,
) {
  const classroom = classroomId
    ? await getStudentClassroomContext(studentId, classroomId, courseId)
    : null;
  const [graphResult, profile, practiceCourses] = await Promise.all([
    getStudentPublishedKnowledgeGraph(studentId, courseId),
    getStudentLearnerProfile(studentId, courseId),
    listStudentPracticeCourses(studentId),
  ]);
  const [
    events,
    recommendations,
    profileHistory,
    confirmedReflections,
    submissions,
    practiceGroups,
  ] = await Promise.all([
    prisma.learningEvent.findMany({
      where: {
        studentId,
        courseId,
        supersededBy: null,
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
        concepts: { select: { score: true, maxScore: true } },
      },
    }),
    prisma.personalizedRecommendation.findMany({
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
    }),
    prisma.learnerProfileSnapshot.findMany({
      where: { studentId, courseId },
      orderBy: { revisionNumber: "desc" },
      take: 8,
      select: {
        revisionNumber: true,
        createdAt: true,
        objectiveMasteryDimension: true,
      },
    }),
    prisma.studentSelfReflection.count({
      where: {
        studentId,
        courseId,
        status: StudentSelfReflectionStatus.CONFIRMED,
        deletedAt: null,
      },
    }),
    prisma.submission.findMany({
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
      take: 8,
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
    }),
    (async () => {
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
        take: 8,
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
    })(),
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
  const enrolledClassrooms = practiceCourses.filter(
    (course) =>
      course.courseId === courseId &&
      (!classroomId || course.classroomId === classroomId),
  );
  const [classProgress, courseProgress] = await Promise.all([
    prisma.courseTeachingProgressRevision.findMany({
      where: {
        courseId,
        classroomId: {
          in: enrolledClassrooms.map((course) => course.classroomId),
        },
      },
      orderBy: { revisionNumber: "desc" },
      select: { classroomId: true, concepts: { select: { conceptId: true } } },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: {
        currentTeachingProgressRevision: {
          select: { concepts: { select: { conceptId: true } } },
        },
      },
    }),
  ]);
  // Teaching progress follows the selected enrollment; mastery remains course-level.
  const taughtConceptIds = new Set(
    enrolledClassrooms.flatMap((course) =>
      (
        classProgress.find(
          (revision) => revision.classroomId === course.classroomId,
        )?.concepts ??
        courseProgress?.currentTeachingProgressRevision?.concepts ??
        []
      ).map((concept) => concept.conceptId),
    ),
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
      taught: conceptId ? taughtConceptIds.has(conceptId) : false,
      evidenceState:
        concept?.evidenceState ?? LearnerProfileEvidenceState.NO_EVIDENCE,
      evidenceCount: concept?.evidenceCount ?? 0,
      confidence: concept?.confidence ?? 0,
      masteryScore: concept?.masteryScore ?? null,
      status: conceptStatus(concept),
    };
  });
  const conceptIds = pointViews.flatMap((point) =>
    point.conceptId ? [point.conceptId] : [],
  );
  const courseTeacher = published
    ? await prisma.course.findUnique({
        where: { id: courseId },
        select: { teacherId: true },
      })
    : null;
  const boundQuestions =
    published && courseTeacher && conceptIds.length
      ? await prisma.question.findMany({
          where: {
            status: QuestionStatus.ACTIVE,
            deletedAt: null,
            AND: [
              {
                OR: [
                  { creatorId: courseTeacher.teacherId },
                  { visibility: QuestionVisibility.PUBLIC },
                ],
              },
              {
                graphBindings: {
                  some: { courseId, conceptId: { in: conceptIds } },
                },
              },
            ],
          },
          orderBy: [{ creatorId: "asc" }, { title: "asc" }, { id: "asc" }],
          take: 1000,
          select: {
            id: true,
            title: true,
            type: true,
            difficulty: true,
            creatorId: true,
            graphBindings: {
              where: { courseId, conceptId: { in: conceptIds } },
              select: { conceptId: true, bindingType: true },
            },
          },
        })
      : [];
  const questionsByConceptId = new Map<
    string,
    Array<{
      id: string;
      title: string;
      type: (typeof boundQuestions)[number]["type"];
      difficulty: number;
      bindingType: (typeof boundQuestions)[number]["graphBindings"][number]["bindingType"];
      fromCourseTeacher: boolean;
    }>
  >();
  for (const question of boundQuestions) {
    for (const binding of question.graphBindings) {
      const related = questionsByConceptId.get(binding.conceptId) ?? [];
      related.push({
        id: question.id,
        title: question.title,
        type: question.type,
        difficulty: question.difficulty,
        bindingType: binding.bindingType,
        fromCourseTeacher: question.creatorId === courseTeacher?.teacherId,
      });
      questionsByConceptId.set(binding.conceptId, related);
    }
  }
  const pointViewsWithQuestions = pointViews.map((point) => ({
    ...point,
    relatedQuestions: point.conceptId
      ? (questionsByConceptId.get(point.conceptId) ?? [])
      : [],
  }));
  const pointByKey = new Map(
    pointViewsWithQuestions.map((point) => [point.key, point]),
  );
  const pointOrderByKey = new Map(
    pointViews.map((point, index) => [point.key, index]),
  );
  const chapters =
    structure?.nodes
      .filter((node) => node.type === "CHAPTER")
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          left.code.localeCompare(right.code, "zh-CN", { numeric: true }),
      )
      .map((chapter) => ({
        key: chapter.key,
        code: chapter.code,
        name: chapter.name,
        concepts: (structure?.edges ?? [])
          .filter(
            (edge) => edge.type === "CONTAINS" && edge.from === chapter.key,
          )
          .map((edge) => pointByKey.get(edge.to))
          .filter((point): point is NonNullable<typeof point> => Boolean(point))
          .sort(
            (left, right) =>
              (pointOrderByKey.get(left.key) ?? Number.POSITIVE_INFINITY) -
              (pointOrderByKey.get(right.key) ?? Number.POSITIVE_INFINITY),
          ),
      })) ?? [];
  const chapterPointViews = chapters.flatMap((chapter) => chapter.concepts);
  const chapterPointKeys = new Set(chapterPointViews.map((point) => point.key));
  const orderedPointViews = [
    ...chapterPointViews,
    ...pointViews.filter((point) => !chapterPointKeys.has(point.key)),
  ];

  // 学习中心的漏斗只统计已纳入教学进度的知识点，保证每一级都是上一级的子集。
  const taught = orderedPointViews.filter((point) => point.taught);
  const evidenceConcepts = taught.filter((point) => point.evidenceCount > 0);
  const conclusive = evidenceConcepts.filter(
    (point) => point.evidenceState === LearnerProfileEvidenceState.CONCLUSIVE,
  );
  const mastered = conclusive.filter((point) => point.status === "MASTERED");
  const needsSupport = taught.filter(
    (point) => point.status === "NEEDS_SUPPORT",
  );
  const insufficient = taught.filter(
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
  const scoreEvents = buildScoreTrend([
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
  ]);
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
  const teachingProgress = ratioPercent(taught.length, pointViews.length);

  const prerequisiteGaps = new Map<string, string[]>();
  for (const point of orderedPointViews.filter(
    (item) => item.taught && item.status !== "MASTERED",
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

  const currentLearningItems = taught
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
  const nextAction = currentFocus
    ? currentFocus.prerequisiteGaps.length
      ? `先复习“${currentFocus.prerequisiteGaps[0]}”，再巩固“${currentFocus.name}”。`
      : `优先巩固“${currentFocus.name}”，完成练习后再查看掌握度变化。`
    : taught.length === 0
      ? "教师尚未设置已授教学进度，可以先查看课程知识图谱了解课程结构。"
      : mastered.length === taught.length
        ? "当前已授知识点均已掌握，可以预习后续内容或继续挑战推荐练习。"
        : "继续完成带知识点的作业或练习，积累足够证据后再判断掌握状态。";

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
      taughtConcepts: taught.length,
      evidenceConcepts: evidenceConcepts.length,
      conclusiveConcepts: conclusive.length,
      masteredConcepts: mastered.length,
      needsSupportConcepts: needsSupport.length,
      activeRecommendations: activeRecommendations.length,
      confirmedReflections,
    },
    progressSteps: [
      {
        key: "teaching-progress",
        label: "教学进度",
        numerator: taught.length,
        denominator: pointViews.length,
        value: teachingProgress,
        detail:
          pointViews.length === 0
            ? "等待教师发布课程图谱"
            : `${taught.length}/${pointViews.length} 个知识点已授`,
      },
      {
        key: "evidence-coverage",
        label: "证据覆盖",
        numerator: evidenceConcepts.length,
        denominator: taught.length,
        value: ratioPercent(evidenceConcepts.length, taught.length),
        detail:
          taught.length === 0
            ? "尚无已授范围"
            : `${evidenceConcepts.length}/${taught.length} 个已授知识点有证据`,
      },
      {
        key: "stable-conclusions",
        label: "稳定结论",
        numerator: conclusive.length,
        denominator: evidenceConcepts.length,
        value: ratioPercent(conclusive.length, evidenceConcepts.length),
        detail:
          evidenceConcepts.length === 0
            ? "需要继续完成练习"
            : `${conclusive.length}/${evidenceConcepts.length} 个证据点达到门槛`,
      },
      {
        key: "mastered-concepts",
        label: "达到掌握",
        numerator: mastered.length,
        denominator: conclusive.length,
        value: ratioPercent(mastered.length, conclusive.length),
        detail:
          conclusive.length === 0
            ? "尚无稳定结论"
            : `${mastered.length}/${conclusive.length} 个稳定结论达到 80 分`,
      },
    ],
    referenceIndicators: [
      {
        key: "objective-mastery",
        label: "稳定掌握均值",
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
      .map((snapshot) => {
        const value = dimensionNumber(
          snapshot.objectiveMasteryDimension,
          "conclusiveAverageMastery",
        );
        return value === null
          ? null
          : {
              label: shortDate(snapshot.createdAt),
              value,
              detail: `课程汇总 · 画像修订 #${snapshot.revisionNumber} · ${snapshot.createdAt.toLocaleString("zh-CN")} · 证据充足 ${dimensionNumber(snapshot.objectiveMasteryDimension, "conclusiveConceptCount") ?? "—"}/${dimensionNumber(snapshot.objectiveMasteryDimension, "conceptCount") ?? "—"} 个知识点`,
            };
      })
      .filter((point): point is NonNullable<typeof point> => Boolean(point)),
    accuracyTrend: scoreEvents.map((event) => ({
      label: shortDate(event.occurredAt),
      value: event.value,
      detail: event.detail,
    })),
    recentActivity: events.slice(0, 8).map((event) => ({
      id: event.id,
      occurredAt: event.occurredAt,
      label:
        event.eventType === LearningEventType.ASSESSMENT_GRADED
          ? "正式作业形成新证据"
          : "推荐练习形成新证据",
      conceptCount: event.concepts.length,
    })),
    heatmap: chapters,
    learningPath: {
      mastered: taught
        .filter((point) => point.status === "MASTERED")
        .slice(0, 6),
      current: currentLearningItems.slice(0, 6),
      next: orderedPointViews.filter((point) => !point.taught).slice(0, 6),
      needsSupport: needsSupport.slice(0, 6),
      insufficient: insufficient.slice(0, 6),
    },
  };
}

export type StudentCourseLearningCenter = Awaited<
  ReturnType<typeof getStudentCourseLearningCenter>
>;
