import { createHash } from "node:crypto";
import {
  AuditAction,
  AuditTargetType,
  GradeSourceType,
  GradeValueStatus,
  MembershipStatus,
  Prisma,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  calculateCourseGrade,
  type FinalGradeOverrideInput,
  type GradeCalculationComponent,
} from "@/services/gradebook/calculation";
import { COURSE_GRADE_RULE_VERSION } from "@/services/gradebook/constants";
import { GradebookOperationError } from "@/services/gradebook/errors";
import type { AuditRequestContext } from "@/services/audit/types";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import { ResourceNotFoundError } from "@/services/auth/policy";

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

export function gradeFingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

async function ownedCourseOrThrow(
  teacherId: string,
  courseId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const course = await client.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      courseNo: true,
      term: true,
      currentPublishedAssessmentSchemeId: true,
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}

async function ownedGradebookOrThrow(
  teacherId: string,
  gradebookId: string,
  client: typeof prisma | Prisma.TransactionClient = prisma,
) {
  const gradebook = await client.courseGradebook.findFirst({
    where: {
      id: gradebookId,
      course: { teacherId },
      classroom: { teacherId },
    },
    include: {
      course: { select: { id: true, name: true, courseNo: true, term: true } },
      classroom: { select: { id: true, name: true, courseId: true } },
      scheme: {
        include: {
          components: { orderBy: { sortOrder: "asc" } },
          outcomes: { orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
  if (!gradebook) throw new ResourceNotFoundError("成绩台账不存在。");
  return gradebook;
}

export async function createTeacherCourseGradebook(
  teacherId: string,
  courseId: string,
  classroomId: string,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Course"
        WHERE "id" = ${courseId} AND "teacherId" = ${teacherId}
        FOR UPDATE
      `;
      const course = await ownedCourseOrThrow(teacherId, courseId, transaction);
      if (!course.currentPublishedAssessmentSchemeId) {
        throw new GradebookOperationError(
          "请先发布正式考核方案。",
          409,
          "PUBLISHED_ASSESSMENT_SCHEME_REQUIRED",
        );
      }
      const classroom = await transaction.classroom.findFirst({
        where: { id: classroomId, teacherId, courseId },
        select: { id: true, name: true },
      });
      if (!classroom) throw new ResourceNotFoundError("班级不存在。");
      const existing = await transaction.courseGradebook.findUnique({
        where: {
          courseId_classroomId_schemeId: {
            courseId,
            classroomId,
            schemeId: course.currentPublishedAssessmentSchemeId,
          },
        },
      });
      if (existing) return existing;
      const scheme =
        await transaction.publishedAssessmentScheme.findUniqueOrThrow({
          where: { id: course.currentPublishedAssessmentSchemeId },
          include: { components: { orderBy: { sortOrder: "asc" } } },
        });
      const gradebook = await transaction.courseGradebook.create({
        data: {
          courseId,
          classroomId,
          schemeId: scheme.id,
          createdById: teacherId,
        },
      });
      const defaultComponents = scheme.components.filter(
        (component) =>
          component.enabled &&
          component.sourceType !== GradeSourceType.PLATFORM_ASSIGNMENT &&
          component.sourceType !== GradeSourceType.ATTENDANCE,
      );
      if (defaultComponents.length > 0) {
        await transaction.gradeItem.createMany({
          data: defaultComponents.map((component, index) => ({
            gradebookId: gradebook.id,
            componentId: component.id,
            sourceKey: `component:${component.id}:default`,
            name: component.name,
            maxScore: component.fullScore,
            itemWeight: new Prisma.Decimal(1),
            sourceType: component.sourceType,
            sortOrder: index + 1,
          })),
        });
      }
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.GRADEBOOK_CREATED,
        targetType: AuditTargetType.GRADEBOOK,
        targetId: gradebook.id,
        summary: `创建班级成绩台账：${classroom.name}`,
        beforeData: null,
        afterData: {
          courseId,
          classroomId,
          schemeId: scheme.id,
          schemeVersion: scheme.versionNumber,
        },
        context,
      });
      return gradebook;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

function normalizedRevisionValue(
  status: GradeValueStatus,
  requestedScore: number | Prisma.Decimal | null,
  maxScore?: Prisma.Decimal,
) {
  if (status === GradeValueStatus.SCORED) {
    if (requestedScore === null) {
      throw new GradebookOperationError("数值成绩必须填写分数。", 400);
    }
    const score = new Prisma.Decimal(requestedScore);
    if (score.isNegative() || (maxScore && score.greaterThan(maxScore))) {
      throw new GradebookOperationError("分数必须在 0 到满分之间。", 422);
    }
    return score.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  }
  if (
    status === GradeValueStatus.ABSENT ||
    status === GradeValueStatus.CHEATING
  ) {
    return new Prisma.Decimal(0);
  }
  return null;
}

interface AppendGradeRevisionInput {
  gradebookId: string;
  gradeItemId: string;
  studentId: string;
  status: GradeValueStatus;
  score: number | Prisma.Decimal | null;
  sourceType: GradeSourceType;
  sourceAssignmentId?: string | null;
  sourceSubmissionId?: string | null;
  sourceFingerprint: string;
  changedById: string;
  reason?: string | null;
  expectedRevisionNumber?: number;
}

async function appendGradeRevision(
  transaction: Prisma.TransactionClient,
  input: AppendGradeRevisionInput,
) {
  const item = await transaction.gradeItem.findFirst({
    where: { id: input.gradeItemId, gradebookId: input.gradebookId },
    select: { id: true, maxScore: true },
  });
  if (!item) throw new ResourceNotFoundError("成绩项不存在。");
  let entry = await transaction.studentGradeEntry.findUnique({
    where: {
      gradeItemId_studentId: {
        gradeItemId: input.gradeItemId,
        studentId: input.studentId,
      },
    },
  });
  if (!entry) {
    entry = await transaction.studentGradeEntry.create({
      data: {
        gradebookId: input.gradebookId,
        gradeItemId: input.gradeItemId,
        studentId: input.studentId,
      },
    });
  }
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StudentGradeEntry"
    WHERE "id" = ${entry.id}
    FOR UPDATE
  `;
  entry = await transaction.studentGradeEntry.findUniqueOrThrow({
    where: { id: entry.id },
  });
  if (
    input.expectedRevisionNumber !== undefined &&
    entry.currentRevisionNumber !== input.expectedRevisionNumber
  ) {
    throw new GradebookOperationError(
      "该学生成绩已被更新，请刷新后重试。",
      409,
      "GRADE_ENTRY_REVISION_CONFLICT",
    );
  }
  const replay = await transaction.studentGradeEntryRevision.findUnique({
    where: {
      entryId_sourceFingerprint: {
        entryId: entry.id,
        sourceFingerprint: input.sourceFingerprint,
      },
    },
  });
  if (replay) return { revision: replay, reused: true };
  const revisionNumber = entry.currentRevisionNumber + 1;
  const score = normalizedRevisionValue(
    input.status,
    input.score,
    item.maxScore,
  );
  const revision = await transaction.studentGradeEntryRevision.create({
    data: {
      entryId: entry.id,
      gradebookId: input.gradebookId,
      gradeItemId: input.gradeItemId,
      studentId: input.studentId,
      revisionNumber,
      status: input.status,
      score,
      sourceType: input.sourceType,
      sourceAssignmentId: input.sourceAssignmentId ?? null,
      sourceSubmissionId: input.sourceSubmissionId ?? null,
      sourceFingerprint: input.sourceFingerprint,
      changedById: input.changedById,
      reason: input.reason ?? null,
    },
  });
  await transaction.studentGradeEntry.update({
    where: { id: entry.id },
    data: { currentRevisionNumber: revisionNumber },
  });
  return { revision, reused: false };
}

export async function appendFinalGradeOverrideRevision(
  transaction: Prisma.TransactionClient,
  input: {
    gradebookId: string;
    studentId: string;
    status: GradeValueStatus;
    score: number | Prisma.Decimal | null;
    sourceType: GradeSourceType;
    sourceFingerprint: string;
    sourceImportRowId?: string | null;
    changedById: string;
    reason?: string | null;
  },
) {
  let state = await transaction.studentFinalGradeOverride.findUnique({
    where: {
      gradebookId_studentId: {
        gradebookId: input.gradebookId,
        studentId: input.studentId,
      },
    },
  });
  if (!state) {
    state = await transaction.studentFinalGradeOverride.create({
      data: { gradebookId: input.gradebookId, studentId: input.studentId },
    });
  }
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StudentFinalGradeOverride"
    WHERE "id" = ${state.id}
    FOR UPDATE
  `;
  state = await transaction.studentFinalGradeOverride.findUniqueOrThrow({
    where: { id: state.id },
  });
  const replay = await transaction.studentFinalGradeOverrideRevision.findUnique(
    {
      where: {
        overrideId_sourceFingerprint: {
          overrideId: state.id,
          sourceFingerprint: input.sourceFingerprint,
        },
      },
    },
  );
  if (replay) return { revision: replay, reused: true };
  const score = normalizedRevisionValue(input.status, input.score);
  if (score && score.greaterThan(100)) {
    throw new GradebookOperationError(
      "课程总评分数必须在 0 到 100 之间。",
      422,
    );
  }
  const revisionNumber = state.currentRevisionNumber + 1;
  const revision = await transaction.studentFinalGradeOverrideRevision.create({
    data: {
      overrideId: state.id,
      gradebookId: input.gradebookId,
      studentId: input.studentId,
      revisionNumber,
      status: input.status,
      score,
      sourceType: input.sourceType,
      sourceFingerprint: input.sourceFingerprint,
      sourceImportRowId: input.sourceImportRowId ?? null,
      changedById: input.changedById,
      reason: input.reason ?? null,
    },
  });
  await transaction.studentFinalGradeOverride.update({
    where: { id: state.id },
    data: { currentRevisionNumber: revisionNumber },
  });
  return { revision, reused: false };
}

export async function correctTeacherGradeEntry(
  teacherId: string,
  gradebookId: string,
  gradeItemId: string,
  studentId: string,
  input: {
    status: GradeValueStatus;
    score: number | null;
    reason: string;
    idempotencyKey: string;
    expectedRevisionNumber: number;
  },
  context: AuditRequestContext,
) {
  return prisma.$transaction(async (transaction) => {
    const gradebook = await ownedGradebookOrThrow(
      teacherId,
      gradebookId,
      transaction,
    );
    const membership = await transaction.classMembership.findFirst({
      where: {
        classroomId: gradebook.classroomId,
        studentId,
        status: MembershipStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (!membership) throw new ResourceNotFoundError("学生不在当前班级中。");
    const result = await appendGradeRevision(transaction, {
      gradebookId,
      gradeItemId,
      studentId,
      status: input.status,
      score: input.score,
      sourceType: GradeSourceType.MANUAL,
      sourceFingerprint: gradeFingerprint({
        source: "MANUAL",
        idempotencyKey: input.idempotencyKey,
        gradebookId,
        gradeItemId,
        studentId,
        status: input.status,
        score: input.score,
      }),
      changedById: teacherId,
      reason: input.reason,
      expectedRevisionNumber: input.expectedRevisionNumber,
    });
    if (!result.reused) {
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.GRADE_ENTRY_CORRECTED,
        targetType: AuditTargetType.GRADE_ENTRY,
        targetId: result.revision.id,
        summary: "人工录入或修正学生成绩",
        beforeData: {
          expectedRevisionNumber: input.expectedRevisionNumber,
        },
        afterData: {
          gradebookId,
          gradeItemId,
          studentId,
          revisionNumber: result.revision.revisionNumber,
          status: result.revision.status,
          score: result.revision.score?.toFixed(4) ?? null,
          reason: input.reason,
        },
        context,
      });
    }
    return result;
  });
}

export async function syncTeacherPlatformAssignmentGrades(
  teacherId: string,
  gradebookId: string,
  componentId: string,
  assignmentId: string,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      const gradebook = await ownedGradebookOrThrow(
        teacherId,
        gradebookId,
        transaction,
      );
      const component = gradebook.scheme.components.find(
        (item) => item.id === componentId,
      );
      if (
        !component ||
        component.sourceType !== GradeSourceType.PLATFORM_ASSIGNMENT
      ) {
        throw new GradebookOperationError(
          "所选考核项目不是平台作业来源。",
          409,
          "PLATFORM_COMPONENT_REQUIRED",
        );
      }
      const assignment = await transaction.assignment.findFirst({
        where: {
          id: assignmentId,
          classroomId: gradebook.classroomId,
          teacherId,
        },
        select: { id: true, title: true, totalPoints: true },
      });
      if (!assignment) throw new ResourceNotFoundError("作业不存在。");
      if (assignment.totalPoints.lessThanOrEqualTo(0)) {
        throw new GradebookOperationError("作业满分必须大于 0。", 409);
      }
      const existingItem = await transaction.gradeItem.findUnique({
        where: {
          gradebookId_sourceKey: {
            gradebookId,
            sourceKey: `assignment:${assignment.id}`,
          },
        },
      });
      const item =
        existingItem ??
        (await transaction.gradeItem.create({
          data: {
            gradebookId,
            componentId,
            assignmentId: assignment.id,
            sourceKey: `assignment:${assignment.id}`,
            name: assignment.title,
            maxScore: assignment.totalPoints,
            itemWeight: new Prisma.Decimal(1),
            sourceType: GradeSourceType.PLATFORM_ASSIGNMENT,
            sortOrder:
              (await transaction.gradeItem.count({ where: { gradebookId } })) +
              1,
          },
        }));
      if (item.componentId !== componentId) {
        throw new GradebookOperationError(
          "该作业已绑定到其他考核项目。",
          409,
          "ASSIGNMENT_GRADE_ITEM_CONFLICT",
        );
      }
      const memberships = await transaction.classMembership.findMany({
        where: {
          classroomId: gradebook.classroomId,
          status: MembershipStatus.ACTIVE,
        },
        select: { studentId: true },
      });
      const submissions = await transaction.submission.findMany({
        where: {
          assignmentId,
          studentId: { in: memberships.map((item) => item.studentId) },
          status: SubmissionStatus.PUBLISHED,
          score: { not: null },
          maxScore: { not: null },
        },
        orderBy: [{ studentId: "asc" }, { attemptNumber: "desc" }],
      });
      const latest = new Map<string, (typeof submissions)[number]>();
      submissions.forEach((submission) => {
        if (!latest.has(submission.studentId)) {
          latest.set(submission.studentId, submission);
        }
      });
      let synced = 0;
      let reused = 0;
      for (const submission of latest.values()) {
        const result = await appendGradeRevision(transaction, {
          gradebookId,
          gradeItemId: item.id,
          studentId: submission.studentId,
          status: GradeValueStatus.SCORED,
          score: submission.score,
          sourceType: GradeSourceType.PLATFORM_ASSIGNMENT,
          sourceAssignmentId: assignment.id,
          sourceSubmissionId: submission.id,
          sourceFingerprint: gradeFingerprint({
            source: "PLATFORM_ASSIGNMENT",
            assignmentId,
            submissionId: submission.id,
            attemptNumber: submission.attemptNumber,
            score: submission.score?.toFixed(4),
            maxScore: submission.maxScore?.toFixed(4),
            publishedAt: submission.publishedAt?.toISOString(),
          }),
          changedById: teacherId,
          reason: "同步已发布的平台作业成绩",
        });
        if (result.reused) reused += 1;
        else synced += 1;
      }
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.PLATFORM_GRADES_SYNCED,
        targetType: AuditTargetType.GRADEBOOK,
        targetId: gradebookId,
        summary: `同步平台作业成绩：${assignment.title}`,
        beforeData: null,
        afterData: {
          assignmentId,
          componentId,
          gradeItemId: item.id,
          publishedSubmissionCount: latest.size,
          syncedCount: synced,
          reusedCount: reused,
        },
        context,
      });
      return {
        gradeItemId: item.id,
        publishedSubmissionCount: latest.size,
        syncedCount: synced,
        reusedCount: reused,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function calculateStudentGradeInTransaction(
  transaction: Prisma.TransactionClient,
  gradebookId: string,
  studentId: string,
  calculatedById: string,
) {
  const gradebook = await transaction.courseGradebook.findUniqueOrThrow({
    where: { id: gradebookId },
    include: {
      scheme: {
        include: {
          components: {
            where: { enabled: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      },
      gradeItems: {
        where: { enabled: true },
        orderBy: { sortOrder: "asc" },
        include: {
          entries: {
            where: { studentId },
            include: {
              revisions: {
                orderBy: { revisionNumber: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });
  const overrideRecord = await transaction.studentFinalGradeOverride.findUnique(
    {
      where: { gradebookId_studentId: { gradebookId, studentId } },
      include: {
        revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
      },
    },
  );
  const overrideRevision = overrideRecord?.revisions[0] ?? null;
  const override: FinalGradeOverrideInput | null = overrideRevision
    ? {
        revisionId: overrideRevision.id,
        status: overrideRevision.status,
        score: overrideRevision.score,
      }
    : null;
  const components: GradeCalculationComponent[] =
    gradebook.scheme.components.map((component) => ({
      componentId: component.id,
      code: component.code,
      name: component.name,
      weight: component.weight,
      entries: gradebook.gradeItems
        .filter((item) => item.componentId === component.id)
        .map((item) => {
          const revision = item.entries[0]?.revisions[0];
          return {
            revisionId: revision?.id ?? null,
            gradeItemId: item.id,
            itemName: item.name,
            itemWeight: item.itemWeight,
            maxScore: item.maxScore,
            status: revision?.status ?? GradeValueStatus.NOT_ENTERED,
            score: revision?.score ?? null,
          };
        }),
    }));
  const result = calculateCourseGrade(components, override);
  const inputSnapshot = {
    schemeId: gradebook.schemeId,
    schemeVersion: gradebook.scheme.versionNumber,
    calculationRuleVersion: COURSE_GRADE_RULE_VERSION,
    studentId,
    components: result.componentResults,
    override: overrideRevision
      ? {
          revisionId: overrideRevision.id,
          status: overrideRevision.status,
          score: overrideRevision.score?.toFixed(4) ?? null,
        }
      : null,
  };
  const inputFingerprint = gradeFingerprint(inputSnapshot);
  const state = await transaction.studentCourseGradeState.upsert({
    where: { gradebookId_studentId: { gradebookId, studentId } },
    update: {},
    create: { gradebookId, studentId },
  });
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "StudentCourseGradeState"
    WHERE "id" = ${state.id}
    FOR UPDATE
  `;
  const existing = await transaction.studentCourseGradeRevision.findUnique({
    where: {
      stateId_inputFingerprint: { stateId: state.id, inputFingerprint },
    },
  });
  if (existing) return { revision: existing, reused: true };
  const latest = await transaction.studentCourseGradeRevision.findFirst({
    where: { stateId: state.id },
    orderBy: { revisionNumber: "desc" },
    select: { revisionNumber: true },
  });
  const revision = await transaction.studentCourseGradeRevision.create({
    data: {
      stateId: state.id,
      gradebookId,
      schemeId: gradebook.schemeId,
      studentId,
      revisionNumber: (latest?.revisionNumber ?? 0) + 1,
      inputFingerprint,
      calculationRuleVersion: COURSE_GRADE_RULE_VERSION,
      status: result.status,
      calculatedScore: result.calculatedScore,
      effectiveStatus: result.effectiveStatus,
      effectiveScore: result.effectiveScore,
      componentResultsJson: jsonValue(result.componentResults),
      inputSnapshotJson: jsonValue(inputSnapshot),
      calculatedById,
    },
  });
  return { revision, reused: false };
}

export async function recalculateTeacherGradebook(
  teacherId: string,
  gradebookId: string,
) {
  return prisma.$transaction(
    async (transaction) => {
      const gradebook = await ownedGradebookOrThrow(
        teacherId,
        gradebookId,
        transaction,
      );
      const memberships = await transaction.classMembership.findMany({
        where: {
          classroomId: gradebook.classroomId,
          status: MembershipStatus.ACTIVE,
        },
        orderBy: { studentId: "asc" },
        select: { studentId: true },
      });
      let createdCount = 0;
      let reusedCount = 0;
      const revisions = [];
      for (const membership of memberships) {
        const result = await calculateStudentGradeInTransaction(
          transaction,
          gradebookId,
          membership.studentId,
          teacherId,
        );
        revisions.push(result.revision);
        if (result.reused) reusedCount += 1;
        else createdCount += 1;
      }
      return {
        studentCount: memberships.length,
        createdCount,
        reusedCount,
        revisions,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function publishTeacherGradebook(
  teacherId: string,
  gradebookId: string,
  context: AuditRequestContext,
) {
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "CourseGradebook"
        WHERE "id" = ${gradebookId}
        FOR UPDATE
      `;
      const gradebook = await ownedGradebookOrThrow(
        teacherId,
        gradebookId,
        transaction,
      );
      const memberships = await transaction.classMembership.findMany({
        where: {
          classroomId: gradebook.classroomId,
          status: MembershipStatus.ACTIVE,
        },
        orderBy: { studentId: "asc" },
        select: { studentId: true },
      });
      if (memberships.length === 0) {
        throw new GradebookOperationError("当前班级没有在读学生。", 409);
      }
      const revisions = [];
      for (const membership of memberships) {
        revisions.push(
          (
            await calculateStudentGradeInTransaction(
              transaction,
              gradebookId,
              membership.studentId,
              teacherId,
            )
          ).revision,
        );
      }
      const inputFingerprint = gradeFingerprint({
        ruleVersion: COURSE_GRADE_RULE_VERSION,
        gradebookId,
        schemeId: gradebook.schemeId,
        revisions: revisions
          .map((revision) => ({
            id: revision.id,
            studentId: revision.studentId,
            inputFingerprint: revision.inputFingerprint,
          }))
          .sort((left, right) => left.studentId.localeCompare(right.studentId)),
      });
      const replay = await transaction.gradebookPublication.findUnique({
        where: {
          gradebookId_inputFingerprint: { gradebookId, inputFingerprint },
        },
      });
      if (replay) {
        await transaction.courseGradebook.update({
          where: { id: gradebookId },
          data: { currentPublicationId: replay.id },
        });
        return { ...replay, reused: true };
      }
      const latest = await transaction.gradebookPublication.findFirst({
        where: { gradebookId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const publication = await transaction.gradebookPublication.create({
        data: {
          gradebookId,
          versionNumber: (latest?.versionNumber ?? 0) + 1,
          inputFingerprint,
          publishedById: teacherId,
        },
      });
      await transaction.gradebookPublicationStudent.createMany({
        data: revisions.map((revision) => ({
          publicationId: publication.id,
          studentId: revision.studentId,
          gradeRevisionId: revision.id,
        })),
      });
      await transaction.courseGradebook.update({
        where: { id: gradebookId },
        data: { currentPublicationId: publication.id },
      });
      await writeGovernanceAuditLog(transaction, {
        actorId: teacherId,
        action: AuditAction.GRADEBOOK_PUBLISHED,
        targetType: AuditTargetType.GRADEBOOK_PUBLICATION,
        targetId: publication.id,
        summary: `发布班级成绩版本 ${publication.versionNumber}`,
        beforeData: gradebook.currentPublicationId
          ? { currentPublicationId: gradebook.currentPublicationId }
          : null,
        afterData: {
          gradebookId,
          versionNumber: publication.versionNumber,
          studentCount: revisions.length,
          inputFingerprint,
          calculationRuleVersion: COURSE_GRADE_RULE_VERSION,
        },
        context,
      });
      return { ...publication, reused: false };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function getTeacherGradebookWorkspace(
  teacherId: string,
  gradebookId: string,
) {
  const gradebook = await ownedGradebookOrThrow(teacherId, gradebookId);
  const [items, memberships, states, publications, assignments] =
    await Promise.all([
      prisma.gradeItem.findMany({
        where: { gradebookId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          entries: {
            include: {
              revisions: {
                orderBy: { revisionNumber: "desc" },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.classMembership.findMany({
        where: {
          classroomId: gradebook.classroomId,
          status: MembershipStatus.ACTIVE,
        },
        orderBy: { joinedAt: "asc" },
        select: {
          studentId: true,
          student: {
            select: {
              profile: { select: { displayName: true, studentNo: true } },
            },
          },
        },
      }),
      prisma.studentCourseGradeState.findMany({
        where: { gradebookId },
        include: {
          revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
        },
      }),
      prisma.gradebookPublication.findMany({
        where: { gradebookId },
        orderBy: { versionNumber: "desc" },
      }),
      prisma.assignment.findMany({
        where: { classroomId: gradebook.classroomId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          totalPoints: true,
          publishedAt: true,
        },
      }),
    ]);
  const latestByStudent = new Map(
    states
      .filter((state) => state.revisions[0])
      .map((state) => [state.studentId, state.revisions[0]!] as const),
  );
  return {
    gradebook,
    items,
    students: memberships.map((membership) => ({
      id: membership.studentId,
      studentNo: membership.student.profile?.studentNo ?? null,
      displayName: membership.student.profile?.displayName ?? "未命名学生",
      latestGrade: latestByStudent.get(membership.studentId) ?? null,
    })),
    assignments,
    currentPublication:
      publications.find((item) => item.id === gradebook.currentPublicationId) ??
      null,
    publicationHistory: publications,
  };
}

export async function listTeacherCourseGradebooks(
  teacherId: string,
  courseId: string,
) {
  await ownedCourseOrThrow(teacherId, courseId);
  return prisma.courseGradebook.findMany({
    where: { courseId },
    include: {
      classroom: { select: { id: true, name: true } },
      scheme: { select: { id: true, versionNumber: true } },
      currentPublication: {
        select: { id: true, versionNumber: true, publishedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getStudentPublishedCourseGrades(
  studentId: string,
  courseId: string,
) {
  const memberships = await prisma.classMembership.findMany({
    where: {
      studentId,
      status: MembershipStatus.ACTIVE,
      classroom: { courseId },
    },
    select: { classroomId: true, classroom: { select: { name: true } } },
  });
  if (memberships.length === 0) {
    throw new ResourceNotFoundError("课程不存在。");
  }
  const gradebooks = await prisma.courseGradebook.findMany({
    where: {
      courseId,
      classroomId: { in: memberships.map((item) => item.classroomId) },
      currentPublicationId: { not: null },
    },
    include: {
      classroom: { select: { id: true, name: true } },
      scheme: {
        select: { id: true, versionNumber: true, calculationRuleVersion: true },
      },
      currentPublication: {
        include: {
          students: {
            where: { studentId },
            include: { gradeRevision: true },
          },
        },
      },
    },
  });
  return gradebooks.flatMap((gradebook) => {
    const row = gradebook.currentPublication?.students[0];
    if (!row || !gradebook.currentPublication) return [];
    return [
      {
        gradebookId: gradebook.id,
        classroom: gradebook.classroom,
        scheme: gradebook.scheme,
        publication: {
          id: gradebook.currentPublication.id,
          versionNumber: gradebook.currentPublication.versionNumber,
          publishedAt: gradebook.currentPublication.publishedAt,
        },
        result: row.gradeRevision,
      },
    ];
  });
}

export async function listStudentPublishedCourseGradeResults(
  studentId: string,
) {
  const gradebooks = await prisma.courseGradebook.findMany({
    where: {
      currentPublicationId: { not: null },
      classroom: {
        memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
      },
    },
    include: {
      course: { select: { id: true, name: true, courseNo: true, term: true } },
      classroom: { select: { id: true, name: true } },
      scheme: { select: { versionNumber: true, calculationRuleVersion: true } },
      currentPublication: {
        include: {
          students: {
            where: { studentId },
            include: { gradeRevision: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return gradebooks.flatMap((gradebook) => {
    const row = gradebook.currentPublication?.students[0];
    if (!row || !gradebook.currentPublication) return [];
    return [
      {
        gradebookId: gradebook.id,
        course: gradebook.course,
        classroom: gradebook.classroom,
        scheme: gradebook.scheme,
        publication: {
          versionNumber: gradebook.currentPublication.versionNumber,
          publishedAt: gradebook.currentPublication.publishedAt,
        },
        result: row.gradeRevision,
      },
    ];
  });
}
