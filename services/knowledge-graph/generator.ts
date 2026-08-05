import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";
import type {
  KnowledgeGraphStructure,
  RelatedInference,
} from "@/services/knowledge-graph/schemas";
import { validateKnowledgeGraph } from "@/services/knowledge-graph/validation";

const safe = (value: string) => encodeURIComponent(value);
export function deterministicGraph(
  courseId: string,
  syllabus: SyllabusParseOutput,
): KnowledgeGraphStructure {
  const courseKey = `course:${courseId}`;
  const nodes: KnowledgeGraphStructure["nodes"] = [
    {
      key: courseKey,
      conceptKey: courseKey,
      type: "COURSE",
      code: syllabus.courseInfo.courseCode!,
      name: syllabus.courseInfo.courseName!,
      description: syllabus.courseInfo.description,
      importance: null,
      isKeyTopic: false,
      isDifficultTopic: false,
      objectiveMappings: syllabus.objectives.map((x) => x.code),
      assessmentMappings: syllabus.assessments.map((x) => x.code),
      sourceType: "SYLLABUS",
      sourceRefs: syllabus.courseInfo.sourceRefs,
      confidence: null,
      sourcePath: "courseInfo",
      sortOrder: 0,
    },
  ];
  const edges: KnowledgeGraphStructure["edges"] = [];
  const keyTopics = new Set(
    syllabus.keyTopics.map((x) => x.knowledgePointCode).filter(Boolean),
  );
  const difficult = new Set(
    syllabus.difficultTopics.map((x) => x.knowledgePointCode).filter(Boolean),
  );
  for (const chapter of syllabus.chapters) {
    const chapterKey = `syllabus:chapter:${safe(chapter.code)}`;
    nodes.push({
      key: chapterKey,
      conceptKey: chapterKey,
      type: "CHAPTER",
      code: chapter.code,
      name: chapter.title,
      description: chapter.description,
      importance: null,
      isKeyTopic: false,
      isDifficultTopic: false,
      objectiveMappings: [],
      assessmentMappings: [],
      sourceType: "SYLLABUS",
      sourceRefs: chapter.sourceRefs,
      confidence: null,
      sourcePath: `chapters.${chapter.code}`,
      sortOrder: chapter.order,
    });
    edges.push({
      key: `contains:${courseKey}:${chapterKey}`,
      type: "CONTAINS",
      from: courseKey,
      to: chapterKey,
      description: null,
      sourceType: "SYLLABUS",
      sourceRefs: chapter.sourceRefs,
      confidence: null,
    });
    chapter.knowledgePoints.forEach((point, index) => {
      const pointKey = `syllabus:kp:${safe(point.code)}`;
      nodes.push({
        key: pointKey,
        conceptKey: pointKey,
        type: "KNOWLEDGE_POINT",
        code: point.code,
        name: point.name,
        description: point.description,
        importance: point.importance,
        isKeyTopic: keyTopics.has(point.code),
        isDifficultTopic: difficult.has(point.code),
        objectiveMappings: [],
        assessmentMappings: [],
        sourceType: "SYLLABUS",
        sourceRefs: point.sourceRefs,
        confidence: null,
        sourcePath: `chapters.${chapter.code}.knowledgePoints.${point.code}`,
        sortOrder: index,
      });
      edges.push({
        key: `contains:${chapterKey}:${pointKey}`,
        type: "CONTAINS",
        from: chapterKey,
        to: pointKey,
        description: null,
        sourceType: "SYLLABUS",
        sourceRefs: point.sourceRefs,
        confidence: null,
      });
    });
  }
  for (const relation of syllabus.prerequisites) {
    const from = `syllabus:kp:${safe(relation.fromKnowledgePointCode)}`;
    const to = `syllabus:kp:${safe(relation.toKnowledgePointCode)}`;
    edges.push({
      key: `prerequisite:${from}:${to}`,
      type: "PREREQUISITE",
      from,
      to,
      description: relation.description,
      sourceType: "SYLLABUS",
      sourceRefs: relation.sourceRefs,
      confidence: null,
    });
  }
  const result = { nodes, edges };
  validateKnowledgeGraph(result);
  return result;
}

export function mergeRelated(
  base: KnowledgeGraphStructure,
  inference: RelatedInference,
): KnowledgeGraphStructure {
  const keys = new Set(
    base.nodes.filter((n) => n.type === "KNOWLEDGE_POINT").map((n) => n.key),
  );
  const related = inference.related.map((item) => {
    if (!keys.has(item.from) || !keys.has(item.to))
      throw new Error("AI_RELATED_ENDPOINT_INVALID");
    const [from, to] = [item.from, item.to].sort();
    return {
      key: `related:${from}:${to}`,
      type: "RELATED" as const,
      from,
      to,
      description: item.description,
      sourceType: "AI_INFERRED" as const,
      sourceRefs: [],
      confidence: item.confidence,
    };
  });
  const result = { nodes: base.nodes, edges: [...base.edges, ...related] };
  validateKnowledgeGraph(result);
  return result;
}
