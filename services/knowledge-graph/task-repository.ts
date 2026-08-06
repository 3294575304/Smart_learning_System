import { prisma } from "@/lib/prisma";
import {
  KNOWLEDGE_GRAPH_GENERATOR_VERSION,
  KNOWLEDGE_GRAPH_PROMPT_VERSION,
  KNOWLEDGE_GRAPH_RULE_VERSION,
} from "@/services/knowledge-graph/constants";
import { getCurrentPublishedSyllabusForKnowledgeGraph } from "@/services/knowledge-graph/syllabus-source";

export async function findOrCreateTeacherKnowledgeGraphDraft(
  teacherId: string,
  courseId: string,
) {
  const source = await getCurrentPublishedSyllabusForKnowledgeGraph(
    teacherId,
    courseId,
  );
  return prisma.knowledgeGraphDraft.upsert({
    where: {
      sourceSyllabusStructureId_generatorVersion: {
        sourceSyllabusStructureId: source.id,
        generatorVersion: KNOWLEDGE_GRAPH_GENERATOR_VERSION,
      },
    },
    create: {
      courseId,
      sourceSyllabusStructureId: source.id,
      requestedById: teacherId,
      generatorVersion: KNOWLEDGE_GRAPH_GENERATOR_VERSION,
      promptVersion: KNOWLEDGE_GRAPH_PROMPT_VERSION,
      ruleVersion: KNOWLEDGE_GRAPH_RULE_VERSION,
    },
    update: {},
  });
}
