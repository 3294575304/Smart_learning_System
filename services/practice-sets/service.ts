import "server-only";
import { buildPracticeSet } from "./grouping";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ResourceNotFoundError } from "@/services/auth/policy";
import type { AuthenticatedUser } from "@/services/auth/types";
import { assertCanAccessRecommendation } from "@/services/recommendations/policy";
import { expireStudentRecommendations } from "@/services/recommendations/repository";
import { recommendationIdSchema } from "@/services/recommendations/schemas";
import {
  practiceSetQuerySchema,
  practiceSetStatus,
  type PracticeSet,
  type PracticeSetList,
} from "./types";

const setQuestionSelect =
  Prisma.validator<Prisma.PersonalizedRecommendationSelect>()({
    id: true,
    cycleKey: true,
    status: true,
    createdAt: true,
    courseCycle: {
      select: {
        course: { select: { id: true, name: true } },
        requestSnapshot: true,
      },
    },
    conceptSnapshots: { select: { resolvedNode: { select: { name: true } } } },
    question: {
      select: {
        title: true,
        type: true,
        knowledgePointLinks: {
          select: { knowledgePoint: { select: { name: true } } },
        },
      },
    },
  });
export async function listPracticeSets(
  actor: AuthenticatedUser,
  rawQuery: unknown,
): Promise<PracticeSetList> {
  assertCanAccessRecommendation(actor, actor.id);
  const query = practiceSetQuerySchema.parse(rawQuery);
  await expireStudentRecommendations(actor.id, new Date());
  const [aggregates, cycles] = await Promise.all([
    prisma.personalizedRecommendation.groupBy({
      by: ["cycleKey", "status"],
      where: {
        studentId: actor.id,
        ...(query.courseId === "GENERAL"
          ? { courseCycleId: null }
          : query.courseId
            ? { courseCycle: { is: { courseId: query.courseId } } }
            : {}),
      },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    prisma.courseRecommendationCycle.findMany({
      where: { studentId: actor.id },
      distinct: ["courseId"],
      select: { course: { select: { id: true, name: true } } },
    }),
  ]);
  const groups = new Map<
    string,
    { statuses: (typeof aggregates)[number]["status"][]; generatedAt: number }
  >();
  for (const row of aggregates) {
    const current = groups.get(row.cycleKey) ?? {
      statuses: [],
      generatedAt: 0,
    };
    current.statuses.push(row.status);
    current.generatedAt = Math.max(
      current.generatedAt,
      row._max.createdAt?.getTime() ?? 0,
    );
    groups.set(row.cycleKey, current);
  }
  const ordered = [...groups]
    .filter(
      ([, value]) =>
        !query.status || practiceSetStatus(value.statuses) === query.status,
    )
    .sort(
      (a, b) => b[1].generatedAt - a[1].generatedAt || a[0].localeCompare(b[0]),
    );
  const pageSize = 20;
  const keys = ordered
    .slice((query.page - 1) * pageSize, query.page * pageSize)
    .map(([key]) => key);
  const records = keys.length
    ? await prisma.personalizedRecommendation.findMany({
        where: { studentId: actor.id, cycleKey: { in: keys } },
        orderBy: [{ priority: "desc" }, { id: "asc" }],
        select: setQuestionSelect,
      })
    : [];
  return {
    items: keys.map((key) =>
      buildPracticeSet(records.filter((record) => record.cycleKey === key)),
    ),
    courses: cycles.map((cycle) => cycle.course),
    total: ordered.length,
    nextPage: query.page * pageSize < ordered.length ? query.page + 1 : null,
  };
}

export async function getPracticeSet(
  actor: AuthenticatedUser,
  rawId: unknown,
): Promise<PracticeSet> {
  assertCanAccessRecommendation(actor, actor.id);
  const id = recommendationIdSchema.parse(rawId);
  const anchor = await prisma.personalizedRecommendation.findFirst({
    where: { id, studentId: actor.id },
    select: { cycleKey: true },
  });
  if (!anchor) throw new ResourceNotFoundError("练习组不存在");
  await expireStudentRecommendations(actor.id, new Date());
  const records = await prisma.personalizedRecommendation.findMany({
    where: { studentId: actor.id, cycleKey: anchor.cycleKey },
    orderBy: [{ priority: "desc" }, { id: "asc" }],
    select: setQuestionSelect,
  });
  return buildPracticeSet(records);
}
