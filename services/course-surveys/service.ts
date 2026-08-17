import "server-only";

import {
  AuditAction,
  AuditTargetType,
  CourseSurveyDimension,
  CourseSurveyMode,
  CourseSurveyQuestionType,
  CourseSurveyStatus,
  MembershipStatus,
  NotificationPriority,
  NotificationSourceType,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writeGovernanceAuditLog } from "@/services/audit/repository";
import type { AuditRequestContext } from "@/services/audit/types";
import { ResourceNotFoundError } from "@/services/auth/policy";
import {
  COURSE_SURVEY_PROMPT_VERSION,
  COURSE_SURVEY_RULE_VERSION,
} from "@/services/course-surveys/constants";
import { CourseSurveyOperationError } from "@/services/course-surveys/errors";
import type {
  CourseSurveyListQuery,
  CreateCourseSurveyInput,
  SubmitCourseSurveyInput,
  UpdateCourseSurveyInput,
} from "@/services/course-surveys/schemas";
import { buildSurveySummary } from "@/services/course-surveys/summary";
import { createNotifications } from "@/services/notifications/service";
import { storedPublishableSyllabusStructureSchema } from "@/services/syllabus-parsing/schemas";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function ownedCourse(teacherId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: { id: courseId, teacherId },
    select: {
      id: true,
      name: true,
      currentPublishedSyllabusStructureId: true,
      currentPublishedSyllabusStructure: {
        select: { id: true, structureJson: true },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在。");
  return course;
}

function defaultSurveyQuestions(structureJson: Prisma.JsonValue) {
  const structure =
    storedPublishableSyllabusStructureSchema.parse(structureJson);
  let sortOrder = 1;
  const questions: Array<{
    type: CourseSurveyQuestionType;
    dimension: CourseSurveyDimension;
    prompt: string;
    required: boolean;
    sortOrder: number;
    outcomeCode: string | null;
    outcomeTitle: string | null;
    sourceRefsJson: Prisma.InputJsonValue;
  }> = structure.objectives.map((objective) => ({
    type: CourseSurveyQuestionType.LIKERT_5,
    dimension: CourseSurveyDimension.OUTCOME_SELF_ASSESSMENT,
    prompt: `通过本课程学习，我认为自己已达到“${objective.title}”：${objective.description}`,
    required: true,
    sortOrder: sortOrder++,
    outcomeCode: objective.code,
    outcomeTitle: objective.title,
    sourceRefsJson: json(objective.sourceRefs),
  }));
  const fixed = [
    [CourseSurveyDimension.CONTENT, "课程内容组织清晰，重点与难点安排合理。"],
    [
      CourseSurveyDimension.TEACHING_METHOD,
      "课堂讲解、案例与互动方式有助于我理解课程内容。",
    ],
    [
      CourseSurveyDimension.ASSESSMENT,
      "作业、实验和考试能够合理评价课程目标达成情况。",
    ],
    [
      CourseSurveyDimension.LEARNING_SUPPORT,
      "课程提供的学习资源、答疑和反馈能够支持我的学习。",
    ],
    [
      CourseSurveyDimension.PRACTICE,
      "实验与实践项目提升了我运用 Python 解决问题的能力。",
    ],
  ] as const;
  for (const [dimension, prompt] of fixed) {
    questions.push({
      type: CourseSurveyQuestionType.LIKERT_5,
      dimension,
      prompt,
      required: true,
      sortOrder: sortOrder++,
      outcomeCode: null,
      outcomeTitle: null,
      sourceRefsJson: json([]),
    });
  }
  for (const prompt of [
    "本课程中对你帮助最大的内容或教学安排是什么？",
    "你对课程内容、教学方法、考核方式或学习支持有哪些改进建议？",
  ]) {
    questions.push({
      type: CourseSurveyQuestionType.OPEN_TEXT,
      dimension: CourseSurveyDimension.OPEN_FEEDBACK,
      prompt,
      required: false,
      sortOrder: sortOrder++,
      outcomeCode: null,
      outcomeTitle: null,
      sourceRefsJson: json([]),
    });
  }
  return questions;
}

const teacherSurveyInclude = {
  classroom: { select: { id: true, name: true } },
  sourcePublishedSyllabusStructure: {
    select: { id: true, versionNumber: true },
  },
  questions: { orderBy: { sortOrder: "asc" as const } },
  _count: { select: { responses: true, participations: true } },
  summaryRevisions: { orderBy: { revisionNumber: "desc" as const }, take: 1 },
} satisfies Prisma.CourseSurveyInclude;

export async function createCourseSurveyDraft(
  teacherId: string,
  courseId: string,
  input: CreateCourseSurveyInput,
  context: AuditRequestContext,
) {
  const course = await ownedCourse(teacherId, courseId);
  if (!course.currentPublishedSyllabusStructure) {
    throw new CourseSurveyOperationError(
      "请先发布课程教学大纲，再生成问卷草稿。",
      409,
    );
  }
  const publishedSyllabus = course.currentPublishedSyllabusStructure;
  const classroom = await prisma.classroom.findFirst({
    where: { id: input.classroomId, courseId, teacherId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!classroom) throw new ResourceNotFoundError("班级不存在。");
  const questions = defaultSurveyQuestions(publishedSyllabus.structureJson);
  return prisma.$transaction(async (transaction) => {
    const survey = await transaction.courseSurvey.create({
      data: {
        courseId,
        classroomId: input.classroomId,
        teacherId,
        sourcePublishedSyllabusStructureId:
          course.currentPublishedSyllabusStructureId,
        title: input.title,
        description: input.description || null,
        instructions: input.instructions,
        mode: input.mode,
        opensAt: input.opensAt,
        dueAt: input.dueAt,
        questions: { createMany: { data: questions } },
      },
      include: teacherSurveyInclude,
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.COURSE_SURVEY_CREATED,
      targetType: AuditTargetType.COURSE_SURVEY,
      targetId: survey.id,
      summary: "从正式教学大纲生成结课问卷草稿",
      beforeData: null,
      afterData: {
        courseId,
        classroomId: input.classroomId,
        mode: input.mode,
        questionCount: questions.length,
        syllabusStructureId: publishedSyllabus.id,
      },
      context,
    });
    return survey;
  });
}

export async function listTeacherCourseSurveys(
  teacherId: string,
  courseId: string,
  query: CourseSurveyListQuery,
) {
  await ownedCourse(teacherId, courseId);
  return prisma.courseSurvey.findMany({
    where: {
      courseId,
      teacherId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.classroomId ? { classroomId: query.classroomId } : {}),
    },
    include: teacherSurveyInclude,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}

export async function getTeacherCourseSurvey(
  teacherId: string,
  courseId: string,
  surveyId: string,
) {
  const survey = await prisma.courseSurvey.findFirst({
    where: { id: surveyId, courseId, teacherId },
    include: teacherSurveyInclude,
  });
  if (!survey) throw new ResourceNotFoundError("问卷不存在。");
  return survey;
}

export async function updateCourseSurveyDraft(
  teacherId: string,
  courseId: string,
  surveyId: string,
  input: UpdateCourseSurveyInput,
  context: AuditRequestContext,
) {
  return prisma.$transaction(async (transaction) => {
    const survey = await transaction.courseSurvey.findFirst({
      where: { id: surveyId, courseId, teacherId },
      select: { id: true, status: true, version: true },
    });
    if (!survey) throw new ResourceNotFoundError("问卷不存在。");
    if (survey.status !== CourseSurveyStatus.DRAFT) {
      throw new CourseSurveyOperationError("只有草稿问卷可以编辑。", 409);
    }
    if (survey.version !== input.expectedVersion) {
      throw new CourseSurveyOperationError(
        "问卷已在其他页面更新，请刷新后重试。",
        409,
      );
    }
    const claimed = await transaction.courseSurvey.updateMany({
      where: {
        id: surveyId,
        version: input.expectedVersion,
        status: CourseSurveyStatus.DRAFT,
      },
      data: {
        title: input.title,
        description: input.description || null,
        instructions: input.instructions,
        mode: input.mode,
        opensAt: input.opensAt,
        dueAt: input.dueAt,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new CourseSurveyOperationError(
        "问卷已在其他页面更新，请刷新后重试。",
        409,
      );
    }
    await transaction.courseSurveyQuestion.deleteMany({ where: { surveyId } });
    await transaction.courseSurveyQuestion.createMany({
      data: input.questions.map((question) => ({
        surveyId,
        type: question.type,
        dimension: question.dimension,
        prompt: question.prompt,
        required: question.required,
        sortOrder: question.sortOrder,
        outcomeCode: question.outcomeCode ?? null,
        outcomeTitle: question.outcomeTitle ?? null,
        sourceRefsJson: json(question.sourceRefs),
      })),
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.COURSE_SURVEY_UPDATED,
      targetType: AuditTargetType.COURSE_SURVEY,
      targetId: surveyId,
      summary: "更新结课问卷草稿",
      beforeData: { version: input.expectedVersion },
      afterData: {
        version: input.expectedVersion + 1,
        questionCount: input.questions.length,
      },
      context,
    });
    return transaction.courseSurvey.findUniqueOrThrow({
      where: { id: surveyId },
      include: teacherSurveyInclude,
    });
  });
}

export async function publishCourseSurvey(
  teacherId: string,
  courseId: string,
  surveyId: string,
  expectedVersion: number,
  context: AuditRequestContext,
) {
  return prisma.$transaction(async (transaction) => {
    const survey = await transaction.courseSurvey.findFirst({
      where: { id: surveyId, courseId, teacherId },
      include: {
        questions: { select: { type: true } },
        classroom: {
          select: {
            name: true,
            status: true,
            memberships: {
              where: { status: MembershipStatus.ACTIVE },
              select: { studentId: true },
            },
          },
        },
        teacher: { select: { profile: { select: { displayName: true } } } },
      },
    });
    if (!survey) throw new ResourceNotFoundError("问卷不存在。");
    if (survey.status !== CourseSurveyStatus.DRAFT) {
      throw new CourseSurveyOperationError("问卷已经发布或关闭。", 409);
    }
    if (survey.version !== expectedVersion) {
      throw new CourseSurveyOperationError("问卷已更新，请刷新后重试。", 409);
    }
    if (survey.classroom.status !== "ACTIVE") {
      throw new CourseSurveyOperationError("目标班级当前不可发布问卷。", 409);
    }
    if (survey.dueAt <= new Date()) {
      throw new CourseSurveyOperationError(
        "截止时间已过，请先调整问卷时间。",
        409,
      );
    }
    if (
      !survey.questions.some(
        (item) => item.type === CourseSurveyQuestionType.LIKERT_5,
      )
    ) {
      throw new CourseSurveyOperationError("问卷至少需要一道五级量表题。", 409);
    }
    const publishedAt = new Date();
    const updated = await transaction.courseSurvey.updateMany({
      where: {
        id: surveyId,
        version: expectedVersion,
        status: CourseSurveyStatus.DRAFT,
      },
      data: {
        status: CourseSurveyStatus.PUBLISHED,
        publishedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count !== 1) {
      throw new CourseSurveyOperationError(
        "问卷状态已变化，请刷新后重试。",
        409,
      );
    }
    await createNotifications(
      survey.classroom.memberships.map(({ studentId }) => ({
        recipientId: studentId,
        type: NotificationType.COURSE_SURVEY_PUBLISHED,
        title: "结课问卷已发布",
        content: `${survey.teacher.profile?.displayName ?? "任课教师"}发布了《${survey.title}》。问卷不计入成绩，请在截止时间前完成。`,
        priority: NotificationPriority.NORMAL,
        actionUrl: `/student/surveys/${survey.id}`,
        sourceType: NotificationSourceType.COURSE_SURVEY,
        sourceId: survey.id,
        deduplicationKey: `course-survey-published:${survey.id}`,
        expiresAt: survey.dueAt,
      })),
      transaction,
    );
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.COURSE_SURVEY_PUBLISHED,
      targetType: AuditTargetType.COURSE_SURVEY,
      targetId: surveyId,
      summary: "发布结课教学质量问卷",
      beforeData: {
        status: CourseSurveyStatus.DRAFT,
        version: expectedVersion,
      },
      afterData: {
        status: CourseSurveyStatus.PUBLISHED,
        version: expectedVersion + 1,
        recipientCount: survey.classroom.memberships.length,
        mode: survey.mode,
      },
      context,
    });
    return transaction.courseSurvey.findUniqueOrThrow({
      where: { id: surveyId },
      include: teacherSurveyInclude,
    });
  });
}

export async function closeCourseSurvey(
  teacherId: string,
  courseId: string,
  surveyId: string,
  context: AuditRequestContext,
) {
  const survey = await prisma.courseSurvey.findFirst({
    where: { id: surveyId, courseId, teacherId },
    select: { id: true, status: true },
  });
  if (!survey) throw new ResourceNotFoundError("问卷不存在。");
  if (survey.status === CourseSurveyStatus.CLOSED)
    return generateCourseSurveySummary(teacherId, courseId, surveyId, context);
  if (survey.status !== CourseSurveyStatus.PUBLISHED) {
    throw new CourseSurveyOperationError("只有已发布问卷可以关闭。", 409);
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.courseSurvey.update({
      where: { id: surveyId },
      data: {
        status: CourseSurveyStatus.CLOSED,
        closedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await writeGovernanceAuditLog(transaction, {
      actorId: teacherId,
      action: AuditAction.COURSE_SURVEY_CLOSED,
      targetType: AuditTargetType.COURSE_SURVEY,
      targetId: surveyId,
      summary: "关闭结课教学质量问卷",
      beforeData: { status: CourseSurveyStatus.PUBLISHED },
      afterData: { status: CourseSurveyStatus.CLOSED },
      context,
    });
  });
  return generateCourseSurveySummary(teacherId, courseId, surveyId, context);
}

async function studentSurvey(studentId: string, surveyId: string) {
  const survey = await prisma.courseSurvey.findFirst({
    where: {
      id: surveyId,
      status: {
        in: [CourseSurveyStatus.PUBLISHED, CourseSurveyStatus.CLOSED],
      },
      classroom: {
        status: "ACTIVE",
        memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
      },
    },
    include: {
      course: { select: { id: true, name: true } },
      classroom: { select: { id: true, name: true } },
      questions: { orderBy: { sortOrder: "asc" } },
      participations: { where: { studentId }, select: { submittedAt: true } },
    },
  });
  if (!survey) throw new ResourceNotFoundError("问卷不存在。");
  if (
    survey.status === CourseSurveyStatus.CLOSED &&
    survey.participations.length === 0
  ) {
    throw new ResourceNotFoundError("问卷不存在。");
  }
  return survey;
}

export async function listStudentCourseSurveys(studentId: string) {
  const now = new Date();
  const surveys = await prisma.courseSurvey.findMany({
    where: {
      OR: [
        { status: CourseSurveyStatus.PUBLISHED, dueAt: { gt: now } },
        {
          status: CourseSurveyStatus.CLOSED,
          participations: { some: { studentId } },
        },
      ],
      classroom: {
        status: "ACTIVE",
        memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
      },
    },
    include: {
      course: { select: { id: true, name: true } },
      classroom: { select: { id: true, name: true } },
      participations: { where: { studentId }, select: { submittedAt: true } },
      _count: { select: { questions: true } },
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
  });
  return surveys.map((survey) => ({
    ...survey,
    isOpen:
      survey.status === CourseSurveyStatus.PUBLISHED &&
      survey.opensAt <= now &&
      survey.dueAt > now,
    submittedAt: survey.participations[0]?.submittedAt ?? null,
    participations: undefined,
  }));
}

export async function getStudentCourseSurvey(
  studentId: string,
  surveyId: string,
) {
  const survey = await studentSurvey(studentId, surveyId);
  const now = new Date();
  if (survey.participations[0]) {
    return {
      ...survey,
      submittedAt: survey.participations[0].submittedAt,
      participations: undefined,
    };
  }
  if (survey.opensAt > now)
    throw new CourseSurveyOperationError("问卷尚未开放。", 409);
  if (survey.dueAt <= now)
    throw new CourseSurveyOperationError("问卷已截止。", 409);
  return {
    ...survey,
    submittedAt: null,
    participations: undefined,
  };
}

function assertAnswers(
  questions: Array<{
    id: string;
    type: CourseSurveyQuestionType;
    required: boolean;
  }>,
  input: SubmitCourseSurveyInput,
) {
  const byQuestion = new Map(
    input.answers.map((answer) => [answer.questionId, answer]),
  );
  for (const question of questions) {
    const answer = byQuestion.get(question.id);
    if (
      question.required &&
      (!answer || (answer.kind === "TEXT" && !answer.value.trim()))
    ) {
      throw new CourseSurveyOperationError("请完成所有必答题。", 400);
    }
    if (!answer) continue;
    const expected =
      question.type === CourseSurveyQuestionType.LIKERT_5 ? "SCALE" : "TEXT";
    if (answer.kind !== expected) {
      throw new CourseSurveyOperationError("回答类型与题目不匹配。", 400);
    }
  }
  if (
    input.answers.some(
      (answer) =>
        !questions.some((question) => question.id === answer.questionId),
    )
  ) {
    throw new CourseSurveyOperationError("回答包含不属于该问卷的题目。", 400);
  }
}

export async function submitCourseSurveyResponse(
  studentId: string,
  surveyId: string,
  input: SubmitCourseSurveyInput,
  context: AuditRequestContext,
) {
  const existing = await prisma.courseSurveyParticipation.findUnique({
    where: { surveyId_studentId: { surveyId, studentId } },
    select: { submittedAt: true },
  });
  if (existing) return { submittedAt: existing.submittedAt, reused: true };
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const survey = await transaction.courseSurvey.findFirst({
          where: {
            id: surveyId,
            status: CourseSurveyStatus.PUBLISHED,
            opensAt: { lte: new Date() },
            dueAt: { gt: new Date() },
            classroom: {
              status: "ACTIVE",
              memberships: {
                some: { studentId, status: MembershipStatus.ACTIVE },
              },
            },
          },
          include: { questions: { orderBy: { sortOrder: "asc" } } },
        });
        if (!survey)
          throw new ResourceNotFoundError("问卷不存在或当前不可提交。");
        assertAnswers(survey.questions, input);
        const submittedAt = new Date();
        const response = await transaction.courseSurveyResponse.create({
          data: {
            surveyId,
            studentId:
              survey.mode === CourseSurveyMode.IDENTIFIED ? studentId : null,
            submittedAt,
            answers: {
              createMany: {
                data: input.answers.map((answer) => ({
                  questionId: answer.questionId,
                  scaleValue: answer.kind === "SCALE" ? answer.value : null,
                  textValue: answer.kind === "TEXT" ? answer.value : null,
                })),
              },
            },
          },
          select: { id: true },
        });
        await transaction.courseSurveyParticipation.create({
          data: { surveyId, studentId, submittedAt },
        });
        if (survey.mode === CourseSurveyMode.IDENTIFIED) {
          await writeGovernanceAuditLog(transaction, {
            actorId: studentId,
            action: AuditAction.COURSE_SURVEY_RESPONSE_SUBMITTED,
            targetType: AuditTargetType.COURSE_SURVEY_RESPONSE,
            targetId: response.id,
            summary: "提交实名课程问卷回答",
            beforeData: null,
            afterData: { surveyId, mode: CourseSurveyMode.IDENTIFIED },
            context,
          });
        }
        return { submittedAt, reused: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const participation = await prisma.courseSurveyParticipation.findUnique({
        where: { surveyId_studentId: { surveyId, studentId } },
        select: { submittedAt: true },
      });
      if (participation)
        return { submittedAt: participation.submittedAt, reused: true };
    }
    throw error;
  }
}

export async function generateCourseSurveySummary(
  teacherId: string,
  courseId: string,
  surveyId: string,
  context: AuditRequestContext,
) {
  const survey = await prisma.courseSurvey.findFirst({
    where: { id: surveyId, courseId, teacherId },
    include: {
      questions: { orderBy: { sortOrder: "asc" } },
      responses: {
        orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
        include: { answers: { orderBy: { questionId: "asc" } } },
      },
    },
  });
  if (!survey) throw new ResourceNotFoundError("问卷不存在。");
  if (survey.status === CourseSurveyStatus.DRAFT) {
    throw new CourseSurveyOperationError("草稿问卷尚无可汇总回答。", 409);
  }
  const eligibleCount = await prisma.classMembership.count({
    where: { classroomId: survey.classroomId, status: MembershipStatus.ACTIVE },
  });
  const summary = buildSurveySummary({
    surveyId,
    eligibleCount,
    questions: survey.questions.map((question) => ({
      id: question.id,
      type: question.type,
      dimension: question.dimension,
      prompt: question.prompt,
      outcomeCode: question.outcomeCode,
      outcomeTitle: question.outcomeTitle,
    })),
    responses: survey.responses.map((response) => ({
      id: response.id,
      submittedAt: response.submittedAt,
      answers: response.answers.map((answer) => ({
        questionId: answer.questionId,
        scaleValue: answer.scaleValue,
        textValue: answer.textValue,
      })),
    })),
  });
  const existing = await prisma.courseSurveySummaryRevision.findUnique({
    where: {
      surveyId_inputFingerprint: {
        surveyId,
        inputFingerprint: summary.fingerprint,
      },
    },
  });
  if (existing) return existing;
  try {
    return await prisma.$transaction(
      async (transaction) => {
        const latest = await transaction.courseSurveySummaryRevision.findFirst({
          where: { surveyId },
          orderBy: { revisionNumber: "desc" },
          select: { revisionNumber: true },
        });
        const created = await transaction.courseSurveySummaryRevision.create({
          data: {
            surveyId,
            revisionNumber: (latest?.revisionNumber ?? 0) + 1,
            inputFingerprint: summary.fingerprint,
            responseCount: summary.responseCount,
            eligibleCount: summary.eligibleCount,
            isSuppressed: summary.isSuppressed,
            statisticsJson: json({
              responseRate: summary.responseRate,
              minSampleSize: summary.minSampleSize,
              questions: summary.questions,
              outcomes: summary.outcomes,
              dimensions: summary.dimensions,
              overallMean: summary.overallMean,
            }),
            themesJson: json({
              themes: summary.themes,
              narrative: summary.themeNarrative,
            }),
            ruleVersion: COURSE_SURVEY_RULE_VERSION,
            aiStatus: "FALLBACK",
            aiProvider: "rule",
            aiModel: "deterministic-theme-rules-v1",
            promptVersion: COURSE_SURVEY_PROMPT_VERSION,
          },
        });
        await writeGovernanceAuditLog(transaction, {
          actorId: teacherId,
          action: AuditAction.COURSE_SURVEY_SUMMARY_GENERATED,
          targetType: AuditTargetType.COURSE_SURVEY_SUMMARY,
          targetId: created.id,
          summary: `生成课程问卷聚合汇总 v${created.revisionNumber}`,
          beforeData: null,
          afterData: {
            surveyId,
            responseCount: summary.responseCount,
            eligibleCount: summary.eligibleCount,
            isSuppressed: summary.isSuppressed,
            ruleVersion: COURSE_SURVEY_RULE_VERSION,
          },
          context,
        });
        return created;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrent = await prisma.courseSurveySummaryRevision.findUnique({
        where: {
          surveyId_inputFingerprint: {
            surveyId,
            inputFingerprint: summary.fingerprint,
          },
        },
      });
      if (concurrent) return concurrent;
    }
    throw error;
  }
}

export async function getLatestCourseSurveySummary(
  teacherId: string,
  courseId: string,
  surveyId: string,
) {
  const survey = await prisma.courseSurvey.findFirst({
    where: { id: surveyId, courseId, teacherId },
    select: { id: true },
  });
  if (!survey) throw new ResourceNotFoundError("问卷不存在。");
  const summary = await prisma.courseSurveySummaryRevision.findFirst({
    where: { surveyId },
    orderBy: { revisionNumber: "desc" },
  });
  if (!summary) throw new ResourceNotFoundError("问卷汇总尚未生成。");
  return summary;
}
