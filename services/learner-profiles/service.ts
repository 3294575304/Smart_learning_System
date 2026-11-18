import { groupKnowledgeChapters } from "@/services/knowledge-graph/chapter-groups";
import "server-only";
import { runAssignmentSerializable } from "@/services/assignments/transactions";

import {
  AttendanceSessionStatus,
  LearnerProfileEvidenceState,
  LearningEventType,
  MembershipStatus,
  Prisma,
  ProgrammingAttemptKind,
  ProgrammingAttemptStatus,
  StudentSelfReflectionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
import {
  getStudentCourseConceptMastery,
  getTeacherStudentCourseConceptMastery,
  recalculateStudentCourseConceptMastery,
} from "@/services/concept-mastery/service";
import {
  ACTIVITY_WINDOW_DAYS,
  LEARNER_PROFILE_RULE_VERSION,
} from "@/services/learner-profiles/constants";
import {
  evidenceConfidence,
  learnerProfileEvidenceState,
} from "@/services/learner-profiles/calculation";
import {
  buildActivityDimension,
  buildProgrammingDimension,
  buildReflectionDimension,
} from "@/services/learner-profiles/dimensions";
import { learnerProfileFingerprint } from "@/services/learner-profiles/fingerprint";
import { scheduleSnapshotPrune } from "@/services/learner-profiles/snapshot-retention";

async function assertStudentAccess(studentId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      classrooms: {
        some: {
          memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
        },
      },
    },
    select: { id: true },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
}

async function assertTeacherAccess(
  teacherId: string,
  courseId: string,
  studentId?: string,
) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      teacherId,
      ...(studentId
        ? {
            classrooms: {
              some: {
                memberships: {
                  some: { studentId, status: MembershipStatus.ACTIVE },
                },
              },
            },
          }
        : {}),
    },
    select: { id: true, name: true },
  });
  if (!course) throw new ResourceNotFoundError("课程或学生不存在");
  return course;
}

export async function ensureLearnerProfileSnapshot(
  transaction: Prisma.TransactionClient,
  studentId: string,
  courseId: string,
) {
  await recalculateStudentCourseConceptMastery(
    transaction,
    studentId,
    courseId,
  );
  const activitySince = new Date(
    Date.now() - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );
  const [
    course,
    masteryState,
    watermark,
    attendanceRecords,
    activityEvents,
    reflectionRecords,
    reflectionCount,
    programmingAttempts,
    programmingTotal,
  ] = await Promise.all([
    transaction.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        id: true,
        name: true,
        currentPublishedKnowledgeGraphVersion: {
          select: {
            id: true,
            versionNumber: true,
            nodes: {
              orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
              select: {
                conceptId: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    transaction.studentCourseConceptMasteryState.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: {
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            inputFingerprint: true,
            calculationRuleVersion: true,
            entries: {
              orderBy: { conceptId: "asc" },
              select: {
                conceptId: true,
                evidenceCount: true,
                masteryScore: true,
                lastEvidenceAt: true,
                concept: { select: { stableKey: true } },
              },
            },
          },
        },
      },
    }),
    transaction.learningEvent.findFirst({
      where: {
        studentId,
        courseId,
        projectedEvidence: { none: { assignment: { status: "REVOKED" } } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { id: true, occurredAt: true },
    }),
    transaction.attendanceRecord.findMany({
      where: {
        studentId,
        session: {
          courseId,
          status: AttendanceSessionStatus.CLOSED,
        },
      },
      orderBy: [{ session: { startsAt: "asc" } }, { id: "asc" }],
      select: {
        id: true,
        currentStatus: true,
        currentRevisionNumber: true,
        updatedAt: true,
      },
    }),
    transaction.learningEvent.findMany({
      where: {
        studentId,
        courseId,
        supersededBy: null,
        occurredAt: { gte: activitySince },
        projectedEvidence: { none: { assignment: { status: "REVOKED" } } },
        eventType: {
          in: [
            LearningEventType.ASSESSMENT_GRADED,
            LearningEventType.RECOMMENDATION_PRACTICE_GRADED,
          ],
        },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 400,
      select: { id: true, eventType: true, occurredAt: true },
    }),
    transaction.studentSelfReflection.findMany({
      where: {
        studentId,
        courseId,
        status: StudentSelfReflectionStatus.CONFIRMED,
        deletedAt: null,
      },
      orderBy: [{ confirmedAt: "desc" }, { createdAt: "desc" }],
      take: 3,
      select: {
        id: true,
        confirmedAt: true,
        updatedAt: true,
        inputText: true,
        summary: true,
        goals: true,
        difficulties: true,
      },
    }),
    transaction.studentSelfReflection.count({
      where: {
        studentId,
        courseId,
        status: StudentSelfReflectionStatus.CONFIRMED,
        deletedAt: null,
      },
    }),
    transaction.programmingAttempt.findMany({
      where: {
        studentId,
        kind: ProgrammingAttemptKind.FORMAL_JUDGE,
        status: ProgrammingAttemptStatus.SUCCEEDED,
        OR: [
          {
            assignmentQuestion: {
              is: { assignment: { is: { classroom: { is: { courseId } } } } },
            },
          },
          { recommendation: { is: { courseCycle: { is: { courseId } } } } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: {
        id: true,
        score: true,
        maxScore: true,
        completedAt: true,
        createdAt: true,
      },
    }),
    transaction.programmingAttempt.count({
      where: {
        studentId,
        kind: ProgrammingAttemptKind.FORMAL_JUDGE,
        status: ProgrammingAttemptStatus.SUCCEEDED,
        OR: [
          {
            assignmentQuestion: {
              is: { assignment: { is: { classroom: { is: { courseId } } } } },
            },
          },
          { recommendation: { is: { courseCycle: { is: { courseId } } } } },
        ],
      },
    }),
  ]);

  const graph = course.currentPublishedKnowledgeGraphVersion;
  const mastery = masteryState?.revisions[0] ?? null;
  const masteryByConcept = new Map(
    (mastery?.entries ?? []).map((entry) => [entry.conceptId, entry]),
  );
  const allConceptIds = new Set([
    ...(graph?.nodes.map((node) => node.conceptId) ?? []),
    ...(mastery?.entries.map((entry) => entry.conceptId) ?? []),
  ]);
  const concepts = [...allConceptIds].sort().map((conceptId) => {
    const entry = masteryByConcept.get(conceptId);
    const count = entry?.evidenceCount ?? 0;
    return {
      conceptId,
      evidenceCount: count,
      evidenceState: learnerProfileEvidenceState(count),
      confidence: evidenceConfidence(count),
      masteryScore: entry?.masteryScore ?? null,
      evidenceUpdatedAt: entry?.lastEvidenceAt ?? null,
    };
  });
  const conclusive = concepts.filter(
    (item) => item.evidenceState === LearnerProfileEvidenceState.CONCLUSIVE,
  );
  const conclusiveAverage = conclusive.length
    ? new Prisma.Decimal(
        conclusive.reduce(
          (sum, item) => sum + (item.masteryScore?.toNumber() ?? 0),
          0,
        ) / conclusive.length,
      )
        .toDecimalPlaces(2)
        .toNumber()
    : null;
  const objectiveState =
    conclusive.length > 0
      ? LearnerProfileEvidenceState.CONCLUSIVE
      : concepts.some((item) => item.evidenceCount > 0)
        ? LearnerProfileEvidenceState.INSUFFICIENT_EVIDENCE
        : LearnerProfileEvidenceState.NO_EVIDENCE;
  const attendance = calculateAttendanceRate(
    attendanceRecords.map((record) => record.currentStatus),
  );
  const attendanceState = learnerProfileEvidenceState(attendance.denominator);
  const attendanceDimension = {
    evidenceState: attendanceState,
    evidenceCount: attendance.denominator,
    rate: attendance.rate === null ? null : Number(attendance.rate),
    earnedCredits: Number(attendance.earned),
    updatedAt: attendanceRecords.at(-1)?.updatedAt.toISOString() ?? null,
  };
  const activityDimension = buildActivityDimension({ events: activityEvents });
  const reflectionDimension = buildReflectionDimension({
    confirmedCount: reflectionCount,
    latest: reflectionRecords[0] ?? null,
  });
  const programmingDimension = buildProgrammingDimension({
    total: programmingTotal,
    attempts: programmingAttempts.map((attempt) => ({
      id: attempt.id,
      score: attempt.score?.toNumber() ?? null,
      maxScore: attempt.maxScore?.toNumber() ?? null,
      completedAt: attempt.completedAt,
      createdAt: attempt.createdAt,
    })),
  });
  const objectiveMasteryDimension = {
    evidenceState: objectiveState,
    conceptCount: concepts.length,
    conclusiveConceptCount: conclusive.length,
    insufficientConceptCount: concepts.filter(
      (item) =>
        item.evidenceState ===
        LearnerProfileEvidenceState.INSUFFICIENT_EVIDENCE,
    ).length,
    noEvidenceConceptCount: concepts.filter(
      (item) => item.evidenceState === LearnerProfileEvidenceState.NO_EVIDENCE,
    ).length,
    conclusiveAverageMastery: conclusiveAverage,
  };
  const objectiveSummary =
    objectiveState === LearnerProfileEvidenceState.NO_EVIDENCE
      ? "当前没有可用于形成客观掌握度结论的正式评分证据。"
      : objectiveState === LearnerProfileEvidenceState.INSUFFICIENT_EVIDENCE
        ? "当前已有少量正式评分证据，但尚不足以形成稳定的课程掌握度结论。"
        : `当前有 ${conclusive.length} 个知识概念达到可形成结论的证据门槛；结论仅反映客观评分证据。`;
  const auxiliarySummary = [
    activityDimension.evidenceCount > 0
      ? `近 ${activityDimension.windowDays} 天有 ${activityDimension.activeDays} 天产生评分记录。`
      : `近 ${activityDimension.windowDays} 天没有新的评分记录。`,
    reflectionDimension.evidenceCount > 0
      ? `学生已确认 ${reflectionDimension.evidenceCount} 条学习自述（自述不计入客观掌握度）。`
      : "学生尚未确认学习自述。",
    programmingDimension.evidenceCount > 0
      ? `正式判题 ${programmingDimension.evidenceCount} 次。`
      : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  const summary = `${objectiveSummary} ${auxiliarySummary}`.trim();
  const inputFingerprint = learnerProfileFingerprint({
    ruleVersion: LEARNER_PROFILE_RULE_VERSION,
    graphVersionId: graph?.id ?? null,
    masteryRevision: mastery
      ? {
          id: mastery.id,
          fingerprint: mastery.inputFingerprint,
          ruleVersion: mastery.calculationRuleVersion,
        }
      : null,
    eventWatermark: watermark
      ? { id: watermark.id, occurredAt: watermark.occurredAt.toISOString() }
      : null,
    attendance: attendanceRecords.map((record) => ({
      id: record.id,
      revision: record.currentRevisionNumber,
      status: record.currentStatus,
    })),
    activity: {
      evidenceCount: activityDimension.evidenceCount,
      activeDays: activityDimension.activeDays,
      lastActiveAt: activityDimension.lastActiveAt,
    },
    reflection: {
      evidenceCount: reflectionDimension.evidenceCount,
      latestConfirmedAt: reflectionDimension.latestConfirmedAt,
      latestWordCount: reflectionDimension.latestWordCount,
    },
    programming: {
      evidenceCount: programmingDimension.evidenceCount,
      passedCount: programmingDimension.passedCount,
      lastAttemptAt: programmingDimension.lastAttemptAt,
    },
  });
  /*
   * 廉价失效签名：只由「事件水位 / 出勤最新修订 / 自述条数 / 判题条数 / 图谱 /
   * 掌握度修订 / 规则版本」组成。读页面时用几条轻查询判断快照是否仍然有效，
   * 不必每次重算掌握度。
   */
  const attendanceLatestUpdate = attendanceRecords.reduce<Date | null>(
    (latest, record) =>
      !latest || record.updatedAt > latest ? record.updatedAt : latest,
    null,
  );
  const sourceSignature = learnerProfileFingerprint({
    ruleVersion: LEARNER_PROFILE_RULE_VERSION,
    graphVersionId: graph?.id ?? null,
    eventId: watermark?.id ?? null,
    masteryRevisionId: mastery?.id ?? null,
    attendance: {
      count: attendanceRecords.length,
      updatedAt: attendanceLatestUpdate?.toISOString() ?? null,
    },
    reflection: {
      count: reflectionCount,
      updatedAt: reflectionRecords[0]?.confirmedAt?.toISOString() ?? null,
    },
    programming: {
      count: programmingTotal,
      updatedAt: programmingAttempts[0]?.createdAt.toISOString() ?? null,
    },
  });
  const existing = await transaction.learnerProfileSnapshot.findUnique({
    where: {
      studentId_courseId_inputFingerprint: {
        studentId,
        courseId,
        inputFingerprint,
      },
    },
    select: { id: true, sourceSignature: true },
  });
  if (existing) {
    /*
     * 历史快照可能还没有签名（签名列是后加的）。补齐一次，
     * 否则读路径每次都会判定"快照失效"从而反复重算。
     */
    if (existing.sourceSignature !== sourceSignature) {
      await transaction.learnerProfileSnapshot.update({
        where: { id: existing.id },
        data: { sourceSignature },
      });
    }
    return existing.id;
  }
  const latest = await transaction.learnerProfileSnapshot.findFirst({
    where: { studentId, courseId },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true },
  });
  const created = await transaction.learnerProfileSnapshot.create({
    data: {
      studentId,
      courseId,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      inputFingerprint,
      sourceSignature,
      calculationRuleVersion: LEARNER_PROFILE_RULE_VERSION,
      eventWatermarkId: watermark?.id ?? null,
      eventWatermarkOccurredAt: watermark?.occurredAt ?? null,
      graphVersionId: graph?.id ?? null,
      masteryRevisionId: mastery?.id ?? null,
      attendanceDimension,
      activityDimension: activityDimension as unknown as Prisma.InputJsonValue,
      reflectionDimension:
        reflectionDimension as unknown as Prisma.InputJsonValue,
      programmingDimension:
        programmingDimension as unknown as Prisma.InputJsonValue,
      objectiveMasteryDimension,
      summary,
      concepts: { create: concepts },
    },
    select: { id: true },
  });
  return created.id;
}

async function ensureSnapshot(studentId: string, courseId: string) {
  const snapshotId = await runAssignmentSerializable(
    (transaction) =>
      ensureLearnerProfileSnapshot(transaction, studentId, courseId),
    "画像正在更新，请稍后重试",
    30_000,
  );
  /*
   * 快照已提交后再回收过期版本：回收是纯清理，不进事务、不阻塞读，
   * 同一学生/课程 10 分钟内最多跑一次（见 snapshot-retention.ts）。
   * 写路径（评分/判题）直接调 ensureLearnerProfileSnapshot，产生的历史
   * 版本会在下一次有人打开画像时一并回收。
   */
  scheduleSnapshotPrune(studentId, courseId);
  return snapshotId;
}

/** 快照最长复用时间：兜底那些没有进入签名的变化（如成绩撤销后的重算）。 */
const PROFILE_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * 页面读取画像的统一入口：先比对廉价签名，命中就直接复用最新快照。
 * 只有数据变化、规则升级或快照过旧时才进入重算事务。
 */
async function resolveSnapshot(studentId: string, courseId: string) {
  const [
    snapshot,
    course,
    event,
    attendance,
    reflections,
    programming,
    mastery,
  ] = await Promise.all([
    prisma.learnerProfileSnapshot.findFirst({
      where: { studentId, courseId },
      orderBy: { revisionNumber: "desc" },
      select: {
        id: true,
        sourceSignature: true,
        calculationRuleVersion: true,
        createdAt: true,
      },
    }),
    prisma.course.findUnique({
      where: { id: courseId },
      select: { currentPublishedKnowledgeGraphVersionId: true },
    }),
    prisma.learningEvent.findFirst({
      where: {
        studentId,
        courseId,
        supersededBy: null,
        projectedEvidence: { none: { assignment: { status: "REVOKED" } } },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
    prisma.attendanceRecord.aggregate({
      where: {
        studentId,
        session: { courseId, status: AttendanceSessionStatus.CLOSED },
      },
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.studentSelfReflection.aggregate({
      where: {
        studentId,
        courseId,
        status: StudentSelfReflectionStatus.CONFIRMED,
        deletedAt: null,
      },
      _count: { _all: true },
      _max: { confirmedAt: true },
    }),
    prisma.programmingAttempt.aggregate({
      where: {
        studentId,
        kind: ProgrammingAttemptKind.FORMAL_JUDGE,
        status: ProgrammingAttemptStatus.SUCCEEDED,
        OR: [
          {
            assignmentQuestion: {
              is: { assignment: { is: { classroom: { is: { courseId } } } } },
            },
          },
          { recommendation: { is: { courseCycle: { is: { courseId } } } } },
        ],
      },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.studentCourseConceptMasteryState.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
      select: {
        revisions: {
          orderBy: { revisionNumber: "desc" },
          take: 1,
          select: { id: true },
        },
      },
    }),
  ]);
  if (!snapshot) return ensureSnapshot(studentId, courseId);
  if (snapshot.calculationRuleVersion !== LEARNER_PROFILE_RULE_VERSION)
    return ensureSnapshot(studentId, courseId);
  if (Date.now() - snapshot.createdAt.getTime() > PROFILE_SNAPSHOT_MAX_AGE_MS)
    return ensureSnapshot(studentId, courseId);
  const signature = learnerProfileFingerprint({
    ruleVersion: LEARNER_PROFILE_RULE_VERSION,
    graphVersionId: course?.currentPublishedKnowledgeGraphVersionId ?? null,
    eventId: event?.id ?? null,
    masteryRevisionId: mastery?.revisions[0]?.id ?? null,
    attendance: {
      count: attendance._count._all,
      updatedAt: attendance._max.updatedAt?.toISOString() ?? null,
    },
    reflection: {
      count: reflections._count._all,
      updatedAt: reflections._max.confirmedAt?.toISOString() ?? null,
    },
    programming: {
      count: programming._count._all,
      updatedAt: programming._max.createdAt?.toISOString() ?? null,
    },
  });
  if (snapshot.sourceSignature === signature) return snapshot.id;
  return ensureSnapshot(studentId, courseId);
}

async function snapshotView(
  snapshotId: string,
  mastery: Awaited<ReturnType<typeof getStudentCourseConceptMastery>>,
  options: { includeEvidence?: boolean } = {},
) {
  const snapshot = await prisma.learnerProfileSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    include: {
      course: { select: { id: true, name: true, courseNo: true, term: true } },
      student: {
        select: {
          id: true,
          email: true,
          profile: { select: { displayName: true, studentNo: true } },
        },
      },
      graphVersion: {
        select: {
          versionNumber: true,
          nodes: {
            orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
            select: {
              id: true,
              conceptId: true,
              code: true,
              name: true,
              nodeType: true,
              sortOrder: true,
            },
          },
          edges: {
            where: { relationType: "CONTAINS" },
            select: { fromNodeId: true, toNodeId: true },
          },
        },
      },
      concepts: {
        orderBy: [{ evidenceState: "desc" }, { masteryScore: "asc" }],
      },
    },
  });
  const nodeByConcept = new Map(
    snapshot.graphVersion?.nodes.map((node) => [node.conceptId, node]) ?? [],
  );
  const traceByConcept = new Map(
    mastery.concepts.map((concept) => [concept.conceptId, concept]),
  );
  const references =
    options.includeEvidence === false
      ? []
      : mastery.concepts.flatMap(
          (concept) => concept.historicalEvidence.latestReferences,
        );
  const [assignments, assignmentQuestions, practiceQuestions] =
    references.length
      ? await Promise.all([
          prisma.assignment.findMany({
            where: {
              id: {
                in: references
                  .filter((r) => r.sourceType === "ASSIGNMENT")
                  .flatMap((r) => (r.assignmentId ? [r.assignmentId] : [])),
              },
              classroom: { courseId: snapshot.course.id },
            },
            select: { id: true, title: true },
          }),
          prisma.assignmentQuestion.findMany({
            where: {
              id: {
                in: references
                  .filter((r) => r.sourceType === "ASSIGNMENT")
                  .flatMap((r) =>
                    r.assignmentQuestionId ? [r.assignmentQuestionId] : [],
                  ),
              },
              assignment: { classroom: { courseId: snapshot.course.id } },
            },
            select: { id: true, titleSnapshot: true },
          }),
          prisma.question.findMany({
            where: {
              id: {
                in: references
                  .filter((r) => r.sourceType === "RECOMMENDATION_PRACTICE")
                  .flatMap((r) =>
                    r.assignmentQuestionId ? [r.assignmentQuestionId] : [],
                  ),
              },
            },
            select: { id: true, title: true },
          }),
        ])
      : [[], [], []];
  const assignmentNames = new Map(
    assignments.map((row) => [row.id, row.title]),
  );
  const questionNames = new Map([
    ...assignmentQuestions.map((row) => [row.id, row.titleSnapshot] as const),
    ...practiceQuestions.map((row) => [row.id, row.title] as const),
  ]);
  const nodes = [...(snapshot.graphVersion?.nodes ?? [])].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.code.localeCompare(b.code, "zh-CN", { numeric: true }),
  );
  const chapters = groupKnowledgeChapters(
    nodes,
    snapshot.graphVersion?.edges ?? [],
  );
  return {
    id: snapshot.id,
    revisionNumber: snapshot.revisionNumber,
    inputFingerprint: snapshot.inputFingerprint,
    ruleVersion: snapshot.calculationRuleVersion,
    generatedAt: snapshot.createdAt,
    eventWatermark: snapshot.eventWatermarkId
      ? {
          id: snapshot.eventWatermarkId,
          occurredAt: snapshot.eventWatermarkOccurredAt,
        }
      : null,
    graphVersion: snapshot.graphVersion
      ? { versionNumber: snapshot.graphVersion.versionNumber }
      : null,
    masteryRevision: mastery.currentRevision,
    course: snapshot.course,
    student: {
      id: snapshot.student.id,
      displayName:
        snapshot.student.profile?.displayName ?? snapshot.student.email,
      email: snapshot.student.email,
      studentNo: snapshot.student.profile?.studentNo ?? null,
    },
    dimensions: {
      attendance: snapshot.attendanceDimension,
      activity: snapshot.activityDimension,
      reflection: snapshot.reflectionDimension,
      programming: snapshot.programmingDimension,
      objectiveMastery: snapshot.objectiveMasteryDimension,
    },
    summary: snapshot.summary,
    chapters: [
      ...chapters.map((chapter) => ({
        id: chapter.id,
        name: chapter.name,
        conceptIds: chapter.nodes.map((node) => node.conceptId),
      })),
      ...(snapshot.concepts.some((entry) => !nodeByConcept.has(entry.conceptId))
        ? [
            {
              id: "historical",
              name: "历史知识点",
              conceptIds: snapshot.concepts
                .filter((entry) => !nodeByConcept.has(entry.conceptId))
                .map((entry) => entry.conceptId),
            },
          ]
        : []),
    ],
    concepts: snapshot.concepts
      .filter((entry) => {
        const node = nodeByConcept.get(entry.conceptId);
        return !node || node.nodeType === "KNOWLEDGE_POINT";
      })
      .map((entry) => {
        const node = nodeByConcept.get(entry.conceptId);
        const trace = traceByConcept.get(entry.conceptId);
        return {
          conceptId: entry.conceptId,
          code:
            node?.code ??
            trace?.currentResolution.currentNode?.code ??
            trace?.stableKey ??
            "—",
          name:
            node?.name ??
            trace?.currentResolution.currentNode?.name ??
            "历史知识点（名称待确认）",
          evidenceState: entry.evidenceState,
          evidenceCount: entry.evidenceCount,
          confidence: entry.confidence.toNumber(),
          masteryScore: entry.masteryScore?.toNumber() ?? null,
          evidenceUpdatedAt: entry.evidenceUpdatedAt,
          historicalEvidence: trace
            ? {
                ...trace.historicalEvidence,
                latestReferences: trace.historicalEvidence.latestReferences.map(
                  (item) => ({
                    ...item,
                    assignmentName:
                      item.sourceType === "RECOMMENDATION_PRACTICE"
                        ? "推荐练习"
                        : (assignmentNames.get(item.assignmentId ?? "") ??
                          "历史作业"),
                    questionName:
                      questionNames.get(item.assignmentQuestionId ?? "") ??
                      "历史题目",
                  }),
                ),
              }
            : {
                sourceGroups: [],
                latestReferences: [],
                truncated: false,
              },
        };
      }),
  };
}

/**
 * 画像视图。`includeEvidence: false` 时不加载历史评分明细，
 * 供学习中心这类只需要维度与概念的页面使用（可省 150–200ms）。
 */
export async function getStudentLearnerProfileView(
  studentId: string,
  courseId: string,
  options: { includeEvidence?: boolean } = {},
) {
  await assertStudentAccess(studentId, courseId);
  const snapshotId = await resolveSnapshot(studentId, courseId);
  if (options.includeEvidence === false) {
    return snapshotView(
      snapshotId,
      {
        concepts: [],
        currentRevision: null,
      } as unknown as Awaited<
        ReturnType<typeof getStudentCourseConceptMastery>
      >,
      { includeEvidence: false },
    );
  }
  const mastery = await getStudentCourseConceptMastery(studentId, courseId);
  return snapshotView(snapshotId, mastery, { includeEvidence: true });
}

export async function getStudentLearnerProfile(
  studentId: string,
  courseId: string,
) {
  return getStudentLearnerProfileView(studentId, courseId, {
    includeEvidence: true,
  });
}

/** Homepage reads the same immutable snapshot without loading evidence drill-downs. */
export async function getStudentKnowledgeSnapshot(
  studentId: string,
  courseId: string,
) {
  await assertStudentAccess(studentId, courseId);
  const snapshotId = await resolveSnapshot(studentId, courseId);
  const snapshot = await prisma.learnerProfileSnapshot.findUniqueOrThrow({
    where: { id: snapshotId },
    select: {
      revisionNumber: true,
      createdAt: true,
      concepts: {
        select: {
          conceptId: true,
          evidenceState: true,
          evidenceCount: true,
          masteryScore: true,
        },
      },
    },
  });
  return {
    revisionNumber: snapshot.revisionNumber,
    generatedAt: snapshot.createdAt,
    concepts: snapshot.concepts.map((concept) => ({
      ...concept,
      masteryScore: concept.masteryScore?.toNumber() ?? null,
    })),
  };
}

export async function getTeacherStudentLearnerProfile(
  teacherId: string,
  courseId: string,
  studentId: string,
) {
  await assertTeacherAccess(teacherId, courseId, studentId);
  const snapshotId = await resolveSnapshot(studentId, courseId);
  const mastery = await getTeacherStudentCourseConceptMastery(
    teacherId,
    courseId,
    studentId,
  );
  return snapshotView(snapshotId, mastery);
}

export async function listTeacherCourseLearnerProfiles(
  teacherId: string,
  courseId: string,
  options: { classroomId?: string; page?: number } = {},
) {
  const course = await assertTeacherAccess(teacherId, courseId);
  const classrooms = await prisma.classroom.findMany({
    where: { courseId, teacherId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (
    options.classroomId &&
    !classrooms.some((item) => item.id === options.classroomId)
  )
    throw new ResourceNotFoundError("课程或班级不存在");
  const memberships = await prisma.classMembership.findMany({
    where: {
      status: MembershipStatus.ACTIVE,
      classroom: {
        courseId,
        teacherId,
        ...(options.classroomId ? { id: options.classroomId } : {}),
      },
    },
    orderBy: [
      { student: { profile: { displayName: "asc" } } },
      { studentId: "asc" },
    ],
    select: {
      studentId: true,
      student: {
        select: {
          email: true,
          profile: { select: { displayName: true, studentNo: true } },
        },
      },
    },
  });
  const unique = [
    ...new Map(memberships.map((item) => [item.studentId, item])).values(),
  ];
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(unique.length / pageSize));
  const page = Math.min(totalPages, Math.max(1, options.page ?? 1));
  const pageMemberships = unique.slice((page - 1) * pageSize, page * pageSize);
  const pageStudentIds = pageMemberships.map((item) => item.studentId);
  /*
   * 列表页只需要摘要：一次批量取每人的最新快照，不再逐个学生重算。
   * 缺失或规则版本过旧的学生才会进入 resolveSnapshot（通常只发生在
   * 刚上线新规则、或学生从未打开过画像时）。
   */
  const snapshots = pageStudentIds.length
    ? await prisma.learnerProfileSnapshot.findMany({
        where: {
          courseId,
          studentId: { in: pageStudentIds },
          calculationRuleVersion: LEARNER_PROFILE_RULE_VERSION,
        },
        orderBy: [{ studentId: "asc" }, { revisionNumber: "desc" }],
        distinct: ["studentId"],
        select: {
          id: true,
          studentId: true,
          revisionNumber: true,
          createdAt: true,
          summary: true,
          objectiveMasteryDimension: true,
        },
      })
    : [];
  const snapshotByStudent = new Map(
    snapshots.map((snapshot) => [snapshot.studentId, snapshot]),
  );
  for (const membership of pageMemberships) {
    if (snapshotByStudent.has(membership.studentId)) continue;
    const snapshotId = await resolveSnapshot(membership.studentId, courseId);
    const snapshot = await prisma.learnerProfileSnapshot.findUniqueOrThrow({
      where: { id: snapshotId },
      select: {
        id: true,
        studentId: true,
        revisionNumber: true,
        createdAt: true,
        summary: true,
        objectiveMasteryDimension: true,
      },
    });
    snapshotByStudent.set(membership.studentId, snapshot);
  }
  const items = [];
  for (const membership of pageMemberships) {
    const profile = snapshotByStudent.get(membership.studentId);
    if (!profile) continue;
    const objective = profile.objectiveMasteryDimension as {
      evidenceState: string;
      conclusiveAverageMastery: number | null;
      conclusiveConceptCount: number;
    };
    items.push({
      student: {
        id: membership.studentId,
        displayName:
          membership.student.profile?.displayName ?? membership.student.email,
        studentNo: membership.student.profile?.studentNo ?? null,
      },
      snapshotId: profile.id,
      revisionNumber: profile.revisionNumber,
      generatedAt: profile.createdAt,
      summary: profile.summary,
      evidenceState: objective.evidenceState,
      conclusiveAverageMastery: objective.conclusiveAverageMastery,
      conclusiveConceptCount: objective.conclusiveConceptCount,
    });
  }
  return {
    course,
    items,
    classrooms,
    pagination: { page, pageSize, total: unique.length, totalPages },
  };
}

export async function listStudentLearnerProfileCourses(studentId: string) {
  const memberships = await prisma.classMembership.findMany({
    where: {
      studentId,
      status: MembershipStatus.ACTIVE,
      classroom: { courseId: { not: null } },
    },
    orderBy: [
      { classroom: { course: { name: "asc" } } },
      { classroomId: "asc" },
    ],
    select: {
      classroom: {
        select: {
          course: {
            select: { id: true, name: true, courseNo: true, term: true },
          },
        },
      },
    },
  });
  const courses = [
    ...new Map(
      memberships
        .map((item) => item.classroom.course)
        .filter((course): course is NonNullable<typeof course> =>
          Boolean(course),
        )
        .map((course) => [course.id, course]),
    ).values(),
  ];
  return courses.sort(
    (left, right) =>
      right.term.localeCompare(left.term, "zh-CN", { numeric: true }) ||
      left.name.localeCompare(right.name, "zh-CN", { numeric: true }),
  );
}
