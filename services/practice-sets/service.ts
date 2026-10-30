import "server-only";
import { managementView, readPracticeManagement } from "./management";
import type { PracticeManagementView } from "./management-schemas";
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
  type PracticeSet,
  type PracticeSetList,
} from "./types";

const setQuestionSelect =
  Prisma.validator<Prisma.PersonalizedRecommendationSelect>()({
    id: true,
    cycleKey: true,
    status: true,
    assignedPoints: true,
    score: true,
    maxScore: true,
    programmingAttempts: {
      orderBy: { revisionNumber: "desc" },
      take: 1,
      select: { status: true },
    },
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
        status: true,
        deletedAt: true,
        title: true,
        type: true,
        knowledgePointLinks: {
          select: { knowledgePoint: { select: { name: true } } },
        },
      },
    },
  });
function managedSet(
  set: PracticeSet,
  management: PracticeManagementView,
): PracticeSet {
  const ended = Boolean(management.endedAt || management.trashedAt);
  return {
    ...set,
    title: management.title ?? set.title,
    management,
    status: ended && set.status === "ACTIVE" ? "EXPIRED" : set.status,
    questions: set.questions.map((q) => ({
      ...q,
      readOnly: ended || q.readOnly,
    })),
  };
}
export async function listPracticeSets(
  actor: AuthenticatedUser,
  rawQuery: unknown,
): Promise<PracticeSetList> {
  assertCanAccessRecommendation(actor, actor.id);
  const query = practiceSetQuerySchema.parse(rawQuery);
  if (query.courseId && query.courseId !== "GENERAL") {
    const allowed = await prisma.course.findFirst({
      where: {
        id: query.courseId,
        classrooms: {
          some: { memberships: { some: { studentId: actor.id } } },
        },
      },
      select: { id: true },
    });
    if (!allowed) throw new ResourceNotFoundError("课程不存在或无权访问");
  }
  await expireStudentRecommendations(actor.id, new Date());
  const [records, metadata, cycles] = await Promise.all([
    prisma.personalizedRecommendation.findMany({
      where: {
        studentId: actor.id,
        ...(query.courseId === "GENERAL"
          ? { courseCycleId: null }
          : query.courseId
            ? { courseCycle: { is: { courseId: query.courseId } } }
            : {}),
      },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
      select: { ...setQuestionSelect, cycleKey: true },
    }),
    prisma.practiceSetManagement.findMany({ where: { studentId: actor.id } }),
    prisma.courseRecommendationCycle.findMany({
      where: { studentId: actor.id },
      distinct: ["courseId"],
      select: { course: { select: { id: true, name: true } } },
    }),
  ]);
  const groups = new Map<string, typeof records>();
  for (const record of records) {
    const rows = groups.get(record.cycleKey) ?? [];
    rows.push(record);
    groups.set(record.cycleKey, rows);
  }
  const byKey = new Map(metadata.map((row) => [row.cycleKey, row]));
  const keyword = query.keyword?.toLocaleLowerCase();
  const sets = [...groups]
    .map(([key, rows]) =>
      managedSet(
        {
          ...buildPracticeSet(rows),
          generatedAt: new Date(
            Math.max(...rows.map((row) => row.createdAt.getTime())),
          ).toISOString(),
        },
        managementView(byKey.get(key) ?? null),
      ),
    )
    .filter(
      (set) =>
        !keyword ||
        [
          set.title,
          set.courseName,
          ...set.knowledgePoints,
          ...set.questions.map((q) => q.title),
        ].some((value) => value.toLocaleLowerCase().includes(keyword)),
    );
  sets.sort(
    (a, b) =>
      b.generatedAt.localeCompare(a.generatedAt) || a.id.localeCompare(b.id),
  );
  const sectionOf = (set: PracticeSet) =>
    set.management?.trashedAt
      ? "TRASH"
      : set.status === "ACTIVE"
        ? "ACTIVE"
        : "HISTORY";
  const counts = { ACTIVE: 0, HISTORY: 0, TRASH: 0 };
  for (const set of sets) counts[sectionOf(set)]++;
  const section =
    query.section ??
    (query.status && query.status !== "ACTIVE" ? "HISTORY" : "ACTIVE");
  const filtered = sets.filter(
    (set) =>
      sectionOf(set) === section &&
      (!query.status || set.status === query.status),
  );
  const page = Math.min(
    query.page,
    Math.max(1, Math.ceil(filtered.length / 20)),
  );
  return {
    items: filtered.slice((page - 1) * 20, page * 20),
    courses: cycles.map((cycle) => cycle.course),
    total: filtered.length,
    section,
    counts,
    page,
    nextPage: page * 20 < filtered.length ? page + 1 : null,
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
  return managedSet(
    buildPracticeSet(records),
    await readPracticeManagement(actor.id, anchor.cycleKey),
  );
}
