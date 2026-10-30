import { PRACTICE_SCORING_RULE } from "@/services/recommendations/scoring";
import {
  listReviewChapters,
  reviewChapterConcepts,
} from "@/services/review/chapters";
import { getReviewWrongStates } from "@/services/wrong-questions/service";
import "server-only";
import {
  AssignmentStatus,
  MembershipStatus,
  Prisma,
  RecommendationStatus,
  Role,
  type QuestionType,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuthenticatedUser } from "@/services/auth/types";
import { assertRole, ResourceNotFoundError } from "@/services/auth/policy";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import { getWrongQuestionDetail } from "@/services/wrong-questions/service";
import { courseRecommendationGenerationSchema } from "@/services/course-recommendations/schemas";
import { expireStudentRecommendations } from "@/services/recommendations/repository";
import { createCourseRecommendations } from "@/services/course-recommendations/service";
import { favoriteUnavailableReason } from "./policy";
import {
  favoriteSaveSchema,
  favoriteNoteSchema,
  favoritePracticeSchema,
  favoriteQuerySchema,
  favoritePointsSchema,
  favoriteQuestionIdSchema,
  type FavoriteSource,
  type FavoriteView,
  type FavoriteList,
} from "./schemas";

const metadataSelect = Prisma.validator<Prisma.QuestionSelect>()({
  title: true,
  type: true,
  status: true,
  deletedAt: true,
  questionCategoryId: true,
  explanation: true,
  difficulty: true,
  knowledgePointLinks: {
    select: { knowledgePoint: { select: { id: true, name: true } } },
  },
  programmingConfigRevisions: { select: { id: true }, take: 1 },
  graphBindings: {
    select: {
      courseId: true,
      conceptId: true,
      concept: {
        select: { nodes: { select: { graphVersionId: true, name: true } } },
      },
    },
  },
});
const favoriteSelect = Prisma.validator<Prisma.StudentQuestionFavoriteSelect>()(
  {
    id: true,
    studentId: true,
    questionId: true,
    courseId: true,
    sourceKind: true,
    sourceId: true,
    titleSnapshot: true,
    typeSnapshot: true,
    courseNameSnapshot: true,
    knowledgePoints: true,
    note: true,
    revision: true,
    createdAt: true,
    question: { select: metadataSelect },
  },
);
type FavoriteRecord = Prisma.StudentQuestionFavoriteGetPayload<{
  select: typeof favoriteSelect;
}>;
async function studentScopes(studentId: string) {
  return prisma.classMembership.findMany({
    where: {
      studentId,
      status: MembershipStatus.ACTIVE,
      classroom: { status: "ACTIVE" },
    },
    select: {
      classroom: {
        select: {
          id: true,
          teacherId: true,
          courseId: true,
          course: {
            select: {
              id: true,
              name: true,
              questionCategoryId: true,
              currentPublishedKnowledgeGraphVersionId: true,
            },
          },
        },
      },
    },
  });
}
type Scopes = Awaited<ReturnType<typeof studentScopes>>;
function available(record: FavoriteRecord, scopes: Scopes) {
  const course = record.courseId
    ? scopes.find((item) => item.classroom.courseId === record.courseId)
        ?.classroom.course
    : null;
  const allowed = Boolean(
    record.question.questionCategoryId &&
    (record.courseId
      ? course?.questionCategoryId === record.question.questionCategoryId
      : scopes.some(
          (item) =>
            item.classroom.course?.questionCategoryId ===
            record.question.questionCategoryId,
        )),
  );
  const graph = course?.currentPublishedKnowledgeGraphVersionId;
  const hasCourseBinding = Boolean(
    course &&
    graph &&
    record.question.graphBindings.some(
      (binding) =>
        binding.courseId === course.id &&
        binding.concept.nodes.some((node) => node.graphVersionId === graph),
    ),
  );
  return favoriteUnavailableReason({
    ...record.question,
    hasPermission: allowed,
    courseReady: !record.courseId || Boolean(graph),
    hasCourseBinding: !record.courseId || hasCourseBinding,
    hasProgrammingConfig: record.question.programmingConfigRevisions.length > 0,
  });
}
function view(record: FavoriteRecord, scopes: Scopes): FavoriteView {
  const reason = available(record, scopes);
  return {
    id: record.id,
    questionId: record.questionId,
    title: record.titleSnapshot,
    type: record.typeSnapshot,
    courseId: record.courseId,
    courseName: record.courseNameSnapshot ?? "历史练习（未关联课程）",
    knowledgePoints: favoritePointsSchema.parse(record.knowledgePoints),
    note: record.note,
    revision: record.revision,
    createdAt: record.createdAt.toISOString(),
    available: !reason,
    unavailableReason: reason,
    source: {
      kind:
        record.sourceKind === "ASSIGNMENT" ? "ASSIGNMENT" : "RECOMMENDATION",
      id: record.sourceId,
    },
  };
}
interface SourceMetadata {
  questionId: string;
  source: FavoriteSource;
  courseId: string | null;
  courseName: string | null;
  title: string;
  type: QuestionType;
  points: Array<{ id: string; name: string }>;
}
async function resolveSource(
  actor: AuthenticatedUser,
  source: FavoriteSource,
): Promise<SourceMetadata> {
  if (source.kind === "WRONG_QUESTION") {
    await getWrongQuestionDetail(actor.id, source.id);
    const wrong = await prisma.wrongQuestion.findFirst({
      where: { id: source.id, studentId: actor.id },
      select: {
        assignmentQuestionId: true,
        recommendationAnswer: { select: { recommendationId: true } },
      },
    });
    if (!wrong) throw new ResourceNotFoundError("题目不存在");
    return resolveSource(
      actor,
      wrong.assignmentQuestionId
        ? { kind: "ASSIGNMENT", id: wrong.assignmentQuestionId }
        : {
            kind: "RECOMMENDATION",
            id: wrong.recommendationAnswer?.recommendationId ?? "missing",
          },
    );
  }
  if (source.kind === "RECOMMENDATION") {
    const record = await prisma.personalizedRecommendation.findFirst({
      where: { id: source.id, studentId: actor.id },
      select: {
        questionId: true,
        question: { select: metadataSelect },
        courseCycle: { select: { courseId: true, classroomId: true } },
        conceptSnapshots: {
          select: { conceptId: true, resolvedNode: { select: { name: true } } },
        },
      },
    });
    if (!record) throw new ResourceNotFoundError("题目不存在");
    const scopes = await studentScopes(actor.id);
    const scope = record.courseCycle
      ? scopes.find(
          (item) => item.classroom.courseId === record.courseCycle?.courseId,
        )
      : scopes.find(
          (item) =>
            item.classroom.course?.questionCategoryId ===
            record.question.questionCategoryId,
        );
    if (
      !scope ||
      scope.classroom.course?.questionCategoryId !==
        record.question.questionCategoryId
    )
      throw new ResourceNotFoundError("题目不存在");
    return {
      questionId: record.questionId,
      source,
      courseId: record.courseCycle?.courseId ?? null,
      courseName: record.courseCycle
        ? (scope.classroom.course?.name ?? null)
        : null,
      title: record.question.title,
      type: record.question.type,
      points: record.conceptSnapshots.length
        ? record.conceptSnapshots.map((item) => ({
            id: item.conceptId,
            name: item.resolvedNode.name,
          }))
        : record.question.knowledgePointLinks.map(
            (item) => item.knowledgePoint,
          ),
    };
  }
  const record = await prisma.assignmentQuestion.findFirst({
    where: {
      id: source.id,
      assignment: {
        status: { in: [AssignmentStatus.PUBLISHED, AssignmentStatus.CLOSED] },
        classroom: {
          status: "ACTIVE",
          memberships: {
            some: { studentId: actor.id, status: MembershipStatus.ACTIVE },
          },
        },
      },
    },
    select: {
      questionId: true,
      titleSnapshot: true,
      typeSnapshot: true,
      knowledgePointSnapshots: {
        select: { knowledgePointId: true, nameSnapshot: true },
      },
      conceptSnapshots: {
        select: { conceptId: true, sourceNode: { select: { name: true } } },
      },
      assignment: {
        select: {
          classroom: {
            select: { courseId: true, course: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!record || !record.questionId)
    throw new ResourceNotFoundError("题目不存在");
  return {
    questionId: record.questionId,
    source,
    courseId: record.assignment.classroom.courseId,
    courseName: record.assignment.classroom.course?.name ?? null,
    title: record.titleSnapshot,
    type: record.typeSnapshot,
    points: record.conceptSnapshots.length
      ? record.conceptSnapshots.map((item) => ({
          id: item.conceptId,
          name: item.sourceNode.name,
        }))
      : record.knowledgePointSnapshots.map((item) => ({
          id: item.knowledgePointId,
          name: item.nameSnapshot,
        })),
  };
}
export async function getFavoriteSourceState(
  actor: AuthenticatedUser,
  source: FavoriteSource,
) {
  assertRole(actor, [Role.STUDENT]);
  const metadata = await resolveSource(actor, source);
  return {
    ...(await getFavoriteState(actor, metadata.questionId)),
    questionId: metadata.questionId,
  };
}
export async function getFavoriteState(
  actor: AuthenticatedUser,
  rawId: unknown,
) {
  assertRole(actor, [Role.STUDENT]);
  const questionId = favoriteQuestionIdSchema.parse(rawId);
  const record = await prisma.studentQuestionFavorite.findUnique({
    where: { studentId_questionId: { studentId: actor.id, questionId } },
    select: { id: true, note: true, revision: true },
  });
  return { favorited: Boolean(record), ...(record ?? {}) };
}
export async function saveFavorite(
  actor: AuthenticatedUser,
  rawId: unknown,
  rawInput: unknown,
) {
  assertRole(actor, [Role.STUDENT]);
  const questionId = favoriteQuestionIdSchema.parse(rawId);
  const input = favoriteSaveSchema.parse(rawInput);
  const source = await resolveSource(actor, input.source);
  if (source.questionId !== questionId)
    throw new ResourceNotFoundError("题目不存在");
  const points = favoritePointsSchema.parse(source.points.slice(0, 100));
  const record = await prisma.studentQuestionFavorite.upsert({
    where: { studentId_questionId: { studentId: actor.id, questionId } },
    update: {},
    create: {
      studentId: actor.id,
      questionId,
      courseId: source.courseId,
      sourceKind: source.source.kind,
      sourceId: source.source.id,
      titleSnapshot: source.title,
      typeSnapshot: source.type,
      courseNameSnapshot: source.courseName,
      knowledgePoints: points,
    },
    select: { id: true, note: true, revision: true },
  });
  return { favorited: true, ...record };
}
export async function removeFavorite(actor: AuthenticatedUser, rawId: unknown) {
  assertRole(actor, [Role.STUDENT]);
  const questionId = favoriteQuestionIdSchema.parse(rawId);
  await prisma.studentQuestionFavorite.deleteMany({
    where: { studentId: actor.id, questionId },
  });
  return { favorited: false };
}
export async function updateFavoriteNote(
  actor: AuthenticatedUser,
  rawId: unknown,
  rawInput: unknown,
) {
  assertRole(actor, [Role.STUDENT]);
  const questionId = favoriteQuestionIdSchema.parse(rawId);
  const input = favoriteNoteSchema.parse(rawInput);
  const changed = await prisma.studentQuestionFavorite.updateMany({
    where: {
      studentId: actor.id,
      questionId,
      revision: input.expectedRevision,
    },
    data: { note: input.note, revision: { increment: 1 } },
  });
  if (!changed.count) {
    const exists = await getFavoriteState(actor, questionId);
    if (!exists.favorited) throw new ResourceNotFoundError("收藏不存在");
    throw new RecommendationOperationError(
      "备注已被其他页面修改，请刷新后再保存",
      409,
    );
  }
  return getFavoriteState(actor, questionId);
}
export async function listFavorites(
  actor: AuthenticatedUser,
  rawQuery: unknown,
): Promise<FavoriteList> {
  assertRole(actor, [Role.STUDENT]);
  const query = favoriteQuerySchema.parse(rawQuery);
  if (query.courseId && query.courseId !== "GENERAL") {
    const [ownHistory, membership] = await Promise.all([
      prisma.studentQuestionFavorite.count({
        where: { studentId: actor.id, courseId: query.courseId },
      }),
      prisma.classMembership.count({
        where: { studentId: actor.id, classroom: { courseId: query.courseId } },
      }),
    ]);
    if (!ownHistory && !membership)
      throw new ResourceNotFoundError("课程不存在或无权访问");
  }
  const where: Prisma.StudentQuestionFavoriteWhereInput = {
    studentId: actor.id,
    ...(query.courseId === "GENERAL"
      ? { courseId: null }
      : query.courseId
        ? { courseId: query.courseId }
        : {}),
    ...(query.type ? { typeSnapshot: query.type } : {}),
    ...(query.knowledgePointId
      ? {
          knowledgePoints: { array_contains: [{ id: query.knowledgePointId }] },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { titleSnapshot: { contains: query.search, mode: "insensitive" } },
            { note: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  if (query.chapterId) {
    const conceptIds = await reviewChapterConcepts(
      actor.id,
      query.courseId,
      query.chapterId,
    );
    where.AND = [
      {
        OR: [
          {
            question: {
              graphBindings: {
                some: {
                  courseId: query.courseId,
                  conceptId: { in: conceptIds },
                },
              },
            },
          },
          ...conceptIds.map((id) => ({
            knowledgePoints: { array_contains: [{ id }] },
          })),
        ],
      },
    ];
  }
  const [records, total, filters, scopes] = await Promise.all([
    prisma.studentQuestionFavorite.findMany({
      where,
      select: favoriteSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * 20,
      take: 20,
    }),
    prisma.studentQuestionFavorite.count({ where }),
    prisma.studentQuestionFavorite.findMany({
      where: { studentId: actor.id },
      select: {
        courseId: true,
        courseNameSnapshot: true,
        knowledgePoints: true,
      },
    }),
    studentScopes(actor.id),
  ]);
  const [chapters, wrongStates] = await Promise.all([
    listReviewChapters(actor.id, query.courseId),
    getReviewWrongStates(
      actor.id,
      records.map((record) => record.questionId),
    ),
  ]);
  return {
    chapters: chapters.map(({ id, name }) => ({ id, name })),
    items: records.map((record) => ({
      ...view(record, scopes),
      wrongQuestion: wrongStates.get(record.questionId),
    })),
    total,
    nextPage: query.page * 20 < total ? query.page + 1 : null,
    courses: [
      ...new Map(
        [
          ...scopes.flatMap((scope) =>
            scope.classroom.course
              ? [
                  {
                    courseId: scope.classroom.course.id,
                    courseNameSnapshot: scope.classroom.course.name,
                  },
                ]
              : [],
          ),
          ...filters.filter((item) => item.courseId),
        ].map((item) => [
          item.courseId ?? "GENERAL",
          {
            id: item.courseId ?? "GENERAL",
            name: item.courseNameSnapshot ?? "课程",
          },
        ]),
      ).values(),
    ],
    knowledgePoints: [
      ...new Map(
        filters
          .filter(
            (item) =>
              !query.courseId ||
              (item.courseId ?? "GENERAL") === query.courseId,
          )
          .flatMap((item) => favoritePointsSchema.parse(item.knowledgePoints))
          .map((item) => [item.id, item]),
      ).values(),
    ],
  };
}
async function activeFavoritePractice(
  actor: AuthenticatedUser,
  questionId: string,
  scopes: Scopes,
) {
  const active = await prisma.personalizedRecommendation.findFirst({
    where: {
      studentId: actor.id,
      questionId,
      status: {
        in: [RecommendationStatus.PENDING, RecommendationStatus.STARTED],
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, courseCycle: { select: { courseId: true } } },
  });
  if (!active) return null;
  if (
    active.courseCycle &&
    !scopes.some(
      (item) => item.classroom.courseId === active.courseCycle?.courseId,
    )
  )
    throw new RecommendationOperationError(
      "该题在另一课程练习中尚未结束，请先处理原练习记录",
      409,
    );
  return { practiceUrl: `/student/recommendations/${active.id}/practice` };
}
export async function practiceFavorite(
  actor: AuthenticatedUser,
  rawId: unknown,
  rawInput: unknown,
) {
  assertRole(actor, [Role.STUDENT]);
  const questionId = favoriteQuestionIdSchema.parse(rawId);
  const input = favoritePracticeSchema.parse(rawInput);
  const record = await prisma.studentQuestionFavorite.findUnique({
    where: { studentId_questionId: { studentId: actor.id, questionId } },
    select: favoriteSelect,
  });
  if (!record) throw new ResourceNotFoundError("收藏不存在");
  const scopes = await studentScopes(actor.id);
  const reason = available(record, scopes);
  if (reason) throw new RecommendationOperationError(reason, 409);
  await expireStudentRecommendations(actor.id, new Date());
  const existingPractice = await activeFavoritePractice(
    actor,
    questionId,
    scopes,
  );
  if (existingPractice) return existingPractice;
  try {
    if (record.courseId) {
      const scope = scopes.find(
        (item) => item.classroom.courseId === record.courseId,
      );
      if (!scope?.classroom.course)
        throw new ResourceNotFoundError("课程不存在");
      const cycle = await createCourseRecommendations(
        actor,
        record.courseId,
        courseRecommendationGenerationSchema.parse({
          classroomId: scope.classroom.id,
          conceptIds: record.question.graphBindings
            .filter(
              (binding) =>
                binding.courseId === record.courseId &&
                binding.concept.nodes.some(
                  (node) =>
                    node.graphVersionId ===
                    scope.classroom.course
                      ?.currentPublishedKnowledgeGraphVersionId,
                ),
            )
            .map((binding) => binding.conceptId)
            .slice(0, 100),
          questionTypes: [record.question.type],
          count: 1,
          difficulty: record.question.difficulty,
          mode: "PRACTICE",
        }),
        new Date(),
        { favoriteId: record.id, questionId, requestId: input.requestId },
      );
      return { practiceUrl: `/student/practice/${cycle.cycle.id}` };
    }
    const now = new Date();
    const cycleKey = `favorite-review:${record.id}:${input.requestId}`;
    const created = await prisma.personalizedRecommendation.upsert({
      where: {
        studentId_questionId_cycleKey: {
          studentId: actor.id,
          questionId,
          cycleKey,
        },
      },
      update: {},
      create: {
        studentId: actor.id,
        questionId,
        cycleKey,
        assignedPoints: 100,
        scoringRuleVersion: PRACTICE_SCORING_RULE,
        status: "PENDING",
        source: "RULE",
        reason: "你主动收藏的题目，用于自主复习；本次作答不计入正式课程成绩。",
        targetDifficulty: record.question.difficulty,
        expiresAt: new Date(now.getTime() + 7 * 86400000),
      },
      select: { id: true },
    });
    return { practiceUrl: `/student/recommendations/${created.id}/practice` };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    ) {
      const existing = await activeFavoritePractice(actor, questionId, scopes);
      if (existing) return existing;
      throw new RecommendationOperationError(
        "练习状态正在更新，请稍后重试",
        409,
      );
    }
    throw error;
  }
}

export async function getFavoriteDetail(
  actor: AuthenticatedUser,
  rawId: unknown,
) {
  assertRole(actor, [Role.STUDENT]);
  const questionId = favoriteQuestionIdSchema.parse(rawId);
  const record = await prisma.studentQuestionFavorite.findUnique({
    where: { studentId_questionId: { studentId: actor.id, questionId } },
    select: favoriteSelect,
  });
  if (!record) throw new ResourceNotFoundError("收藏不存在");
  const item = view(record, await studentScopes(actor.id));
  if (!item.available) return { favorite: item, question: null };
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    select: {
      content: true,
      difficulty: true,
      options: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, label: true, content: true },
      },
    },
  });
  return { favorite: item, question };
}
