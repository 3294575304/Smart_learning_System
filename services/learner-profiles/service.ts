import "server-only";

import {
  AttendanceSessionStatus,
  LearnerProfileEvidenceState,
  MembershipStatus,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
import {
  getStudentCourseConceptMastery,
  getTeacherStudentCourseConceptMastery,
} from "@/services/concept-mastery/service";
import { LEARNER_PROFILE_RULE_VERSION } from "@/services/learner-profiles/constants";
import {
  evidenceConfidence,
  learnerProfileEvidenceState,
} from "@/services/learner-profiles/calculation";
import { learnerProfileFingerprint } from "@/services/learner-profiles/fingerprint";

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

async function ensureSnapshot(studentId: string, courseId: string) {
  return prisma.$transaction(
    async (transaction) => {
      const [course, masteryState, watermark, attendanceRecords] =
        await Promise.all([
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
            where: { studentId, courseId },
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
      const attendanceState = learnerProfileEvidenceState(
        attendance.denominator,
      );
      const attendanceDimension = {
        evidenceState: attendanceState,
        evidenceCount: attendance.denominator,
        rate: attendance.rate === null ? null : Number(attendance.rate),
        earnedCredits: Number(attendance.earned),
        updatedAt: attendanceRecords.at(-1)?.updatedAt.toISOString() ?? null,
      };
      const unavailableDimension = {
        evidenceState: LearnerProfileEvidenceState.NO_EVIDENCE,
        evidenceCount: 0,
        conclusion: null,
        sourceStatus: "NOT_COLLECTED",
      };
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
          (item) =>
            item.evidenceState === LearnerProfileEvidenceState.NO_EVIDENCE,
        ).length,
        conclusiveAverageMastery: conclusiveAverage,
      };
      const summary =
        objectiveState === LearnerProfileEvidenceState.NO_EVIDENCE
          ? "当前没有可用于形成客观掌握度结论的正式评分证据。"
          : objectiveState === LearnerProfileEvidenceState.INSUFFICIENT_EVIDENCE
            ? "当前已有少量正式评分证据，但尚不足以形成稳定的课程掌握度结论。"
            : `当前有 ${conclusive.length} 个知识概念达到可形成结论的证据门槛；结论仅反映客观评分证据。`;
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
        activity: unavailableDimension,
        reflection: unavailableDimension,
      });
      const existing = await transaction.learnerProfileSnapshot.findUnique({
        where: {
          studentId_courseId_inputFingerprint: {
            studentId,
            courseId,
            inputFingerprint,
          },
        },
        select: { id: true },
      });
      if (existing) return existing.id;
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
          calculationRuleVersion: LEARNER_PROFILE_RULE_VERSION,
          eventWatermarkId: watermark?.id ?? null,
          eventWatermarkOccurredAt: watermark?.occurredAt ?? null,
          graphVersionId: graph?.id ?? null,
          masteryRevisionId: mastery?.id ?? null,
          attendanceDimension,
          activityDimension: unavailableDimension,
          reflectionDimension: unavailableDimension,
          objectiveMasteryDimension,
          summary,
          concepts: { create: concepts },
        },
        select: { id: true },
      });
      return created.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

async function snapshotView(
  snapshotId: string,
  mastery: Awaited<ReturnType<typeof getStudentCourseConceptMastery>>,
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
          nodes: { select: { conceptId: true, code: true, name: true } },
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
      objectiveMastery: snapshot.objectiveMasteryDimension,
    },
    summary: snapshot.summary,
    concepts: snapshot.concepts.map((entry) => {
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
          trace?.stableKey ??
          "历史概念",
        evidenceState: entry.evidenceState,
        evidenceCount: entry.evidenceCount,
        confidence: entry.confidence.toNumber(),
        masteryScore: entry.masteryScore?.toNumber() ?? null,
        evidenceUpdatedAt: entry.evidenceUpdatedAt,
        historicalEvidence: trace?.historicalEvidence ?? {
          sourceGroups: [],
          latestReferences: [],
          truncated: false,
        },
      };
    }),
  };
}

export async function getStudentLearnerProfile(
  studentId: string,
  courseId: string,
) {
  await assertStudentAccess(studentId, courseId);
  const snapshotId = await ensureSnapshot(studentId, courseId);
  const mastery = await getStudentCourseConceptMastery(studentId, courseId);
  return snapshotView(snapshotId, mastery);
}

export async function getTeacherStudentLearnerProfile(
  teacherId: string,
  courseId: string,
  studentId: string,
) {
  await assertTeacherAccess(teacherId, courseId, studentId);
  const snapshotId = await ensureSnapshot(studentId, courseId);
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
) {
  const course = await assertTeacherAccess(teacherId, courseId);
  const memberships = await prisma.classMembership.findMany({
    where: {
      status: MembershipStatus.ACTIVE,
      classroom: { courseId },
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
  const items = [];
  for (const membership of unique) {
    const profile = await getTeacherStudentLearnerProfile(
      teacherId,
      courseId,
      membership.studentId,
    );
    const objective = profile.dimensions.objectiveMastery as {
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
      generatedAt: profile.generatedAt,
      summary: profile.summary,
      evidenceState: objective.evidenceState,
      conclusiveAverageMastery: objective.conclusiveAverageMastery,
      conclusiveConceptCount: objective.conclusiveConceptCount,
    });
  }
  return { course, items };
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
  return [
    ...new Map(
      memberships
        .map((item) => item.classroom.course)
        .filter((course): course is NonNullable<typeof course> =>
          Boolean(course),
        )
        .map((course) => [course.id, course]),
    ).values(),
  ];
}
