import "server-only";

import {
  MembershipStatus,
  Prisma,
  StudentSelfReflectionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createAIProvider } from "@/services/ai/provider-factory";
import {
  createAnonymousStudentId,
  scrubSensitiveText,
} from "@/services/ai/privacy";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { RecommendationOperationError } from "@/services/recommendations/errors";
import { structureSelfReflection } from "@/services/self-reflections/ai";
import {
  createSelfReflectionSchema,
  selfReflectionAIInputSchema,
  updateSelfReflectionSchema,
} from "@/services/self-reflections/schemas";
import { getSystemConfig } from "@/services/system-config/service";

export const SELF_REFLECTION_PROMPT_VERSION = "student-self-reflection-v1";

async function reflectionCourse(studentId: string, courseId: string) {
  const course = await prisma.course.findFirst({
    where: {
      id: courseId,
      classrooms: {
        some: {
          memberships: { some: { studentId, status: MembershipStatus.ACTIVE } },
        },
      },
    },
    select: {
      id: true,
      currentPublishedKnowledgeGraphVersion: {
        select: {
          nodes: {
            orderBy: { sortOrder: "asc" },
            select: { conceptId: true, code: true, name: true },
          },
        },
      },
    },
  });
  if (!course) throw new ResourceNotFoundError("课程不存在");
  return course;
}

function reflectionView(record: {
  id: string;
  inputText: string;
  summary: string;
  goals: string[];
  difficulties: string[];
  learningHabits: string[];
  practiceRequest: Prisma.JsonValue;
  status: StudentSelfReflectionStatus;
  fallbackUsed: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...record,
    practiceRequest:
      record.practiceRequest === null ? null : record.practiceRequest,
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function listSelfReflections(studentId: string, courseId: string) {
  await reflectionCourse(studentId, courseId);
  const records = await prisma.studentSelfReflection.findMany({
    where: {
      studentId,
      courseId,
      status: { not: StudentSelfReflectionStatus.DELETED },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return records.map(reflectionView);
}

export async function createSelfReflection(
  studentId: string,
  courseId: string,
  rawInput: unknown,
) {
  const input = createSelfReflectionSchema.parse(rawInput);
  const course = await reflectionCourse(studentId, courseId);
  const concepts = (
    course.currentPublishedKnowledgeGraphVersion?.nodes ?? []
  ).map((node) => ({ id: node.conceptId, code: node.code, name: node.name }));
  if (!concepts.length)
    throw new RecommendationOperationError("课程尚未发布可用知识图谱", 409);
  const configuredSalt = process.env.AI_PSEUDONYM_SALT?.trim();
  const anonymousStudentId = createAnonymousStudentId(
    studentId,
    configuredSalt || "local-development-pseudonym-salt",
  );
  const sanitizedText = scrubSensitiveText(input.text);
  const aiInput = selfReflectionAIInputSchema.parse({
    anonymousStudentId,
    text: sanitizedText,
    concepts,
  });
  const systemConfig = await getSystemConfig();
  let provider = null;
  if (systemConfig.aiAnalysisEnabled) {
    try {
      const candidate = createAIProvider();
      const externalProvider = candidate.name !== "mock";
      provider =
        externalProvider && (!configuredSalt || configuredSalt.length < 16)
          ? null
          : candidate;
    } catch {
      provider = null;
    }
  }
  const structured = provider
    ? await structureSelfReflection(provider, aiInput)
    : {
        output: {
          summary: sanitizedText,
          goals: [],
          difficulties: [],
          learningHabits: [],
          practiceRequest: null,
        },
        fallbackUsed: true,
      };
  const record = await prisma.studentSelfReflection.create({
    data: {
      studentId,
      courseId,
      inputText: input.text,
      ...structured.output,
      practiceRequest: structured.output.practiceRequest ?? Prisma.JsonNull,
      promptVersion: SELF_REFLECTION_PROMPT_VERSION,
      provider: provider?.name ?? null,
      model: provider?.model ?? null,
      fallbackUsed: structured.fallbackUsed,
    },
  });
  return reflectionView(record);
}

export async function confirmSelfReflection(
  studentId: string,
  courseId: string,
  reflectionId: string,
  rawInput: unknown,
) {
  const input = updateSelfReflectionSchema.parse(rawInput);
  await reflectionCourse(studentId, courseId);
  const current = await prisma.studentSelfReflection.findFirst({
    where: {
      id: reflectionId,
      studentId,
      courseId,
      status: { not: StudentSelfReflectionStatus.DELETED },
    },
  });
  if (!current) throw new ResourceNotFoundError("自我反思不存在");
  const record = await prisma.studentSelfReflection.update({
    where: { id: current.id },
    data: {
      summary: input.summary,
      goals: input.goals,
      difficulties: input.difficulties,
      learningHabits: input.learningHabits,
      practiceRequest:
        input.practiceRequest === undefined
          ? undefined
          : (input.practiceRequest ?? Prisma.JsonNull),
      status: StudentSelfReflectionStatus.CONFIRMED,
      confirmedAt: new Date(),
    },
  });
  return reflectionView(record);
}

export async function deleteSelfReflection(
  studentId: string,
  courseId: string,
  reflectionId: string,
) {
  await reflectionCourse(studentId, courseId);
  const result = await prisma.studentSelfReflection.updateMany({
    where: {
      id: reflectionId,
      studentId,
      courseId,
      status: { not: StudentSelfReflectionStatus.DELETED },
    },
    data: {
      status: StudentSelfReflectionStatus.DELETED,
      deletedAt: new Date(),
    },
  });
  if (!result.count) throw new ResourceNotFoundError("自我反思不存在");
  return { id: reflectionId, deleted: true };
}
