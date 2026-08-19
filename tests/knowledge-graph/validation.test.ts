import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicGraph,
  mergeRelated,
} from "@/services/knowledge-graph/generator";
import { validateKnowledgeGraph } from "@/services/knowledge-graph/validation";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";

const ref = [{ page: 1, quote: "Python", verified: true }];
const syllabus: SyllabusParseOutput = {
  courseInfo: {
    courseName: "Python",
    courseCode: "PY",
    description: null,
    credits: 2,
    totalHours: 32,
    theoryHours: 20,
    practiceHours: 12,
    sourceRefs: ref,
  },
  objectives: [
    { code: "O1", title: "目标", description: "掌握编程", sourceRefs: ref },
  ],
  chapters: [
    {
      code: "C1",
      title: "基础",
      description: null,
      suggestedHours: 2,
      order: 1,
      sourceRefs: ref,
      knowledgePoints: [
        {
          code: "K1",
          name: "变量",
          description: null,
          importance: "CORE",
          sourceRefs: ref,
        },
        {
          code: "K2",
          name: "分支",
          description: null,
          importance: "NORMAL",
          sourceRefs: ref,
        },
      ],
    },
  ],
  practiceItems: [],
  prerequisites: [
    {
      fromKnowledgePointCode: "K1",
      toKnowledgePointCode: "K2",
      description: null,
      sourceRefs: ref,
    },
  ],
  keyTopics: [
    {
      knowledgePointCode: "K1",
      name: "变量",
      description: null,
      sourceRefs: ref,
    },
  ],
  difficultTopics: [],
  assessments: [
    {
      code: "A1",
      name: "期末",
      type: "EXAM",
      weight: 100,
      description: null,
      sourceRefs: ref,
    },
  ],
  objectiveAssessmentMappings: [
    {
      objectiveCode: "O1",
      assessmentCode: "A1",
      allocationRate: 100,
      sourceRefs: ref,
    },
  ],
  materials: [],
  warnings: [],
};

test("正式大纲被稳定地确定性转换且 AI 只能追加 RELATED", () => {
  const first = deterministicGraph("course-1", syllabus);
  const second = deterministicGraph("course-1", syllabus);
  assert.deepEqual(first, second);
  assert.equal(first.nodes.length, 4);
  assert.equal(first.edges.filter((x) => x.type === "PREREQUISITE").length, 1);
  const merged = mergeRelated(first, {
    related: [
      {
        from: "syllabus:kp:K1",
        to: "syllabus:kp:K2",
        description: "控制流相关",
        confidence: 0.8,
      },
    ],
  });
  assert.equal(merged.edges.filter((x) => x.type === "RELATED").length, 1);
  assert.equal(merged.edges.at(-1)?.sourceType, "AI_INFERRED");
});

test("校验拒绝自环、重复边、悬空端点和先修环", () => {
  const base = deterministicGraph("course-1", syllabus);
  assert.throws(
    () =>
      validateKnowledgeGraph({
        ...base,
        edges: [
          ...base.edges,
          {
            key: "bad",
            type: "RELATED",
            from: "syllabus:kp:K1",
            to: "syllabus:kp:K1",
            description: null,
            sourceType: "TEACHER",
            sourceRefs: [],
            confidence: null,
          },
        ],
      }),
    /自环/u,
  );
  assert.throws(
    () =>
      validateKnowledgeGraph({
        ...base,
        edges: [
          ...base.edges,
          {
            key: "bad",
            type: "RELATED",
            from: "missing",
            to: "syllabus:kp:K1",
            description: null,
            sourceType: "TEACHER",
            sourceRefs: [],
            confidence: null,
          },
        ],
      }),
    /不存在/u,
  );
  assert.throws(
    () =>
      validateKnowledgeGraph({
        ...base,
        edges: [
          ...base.edges,
          {
            key: "reverse",
            type: "PREREQUISITE",
            from: "syllabus:kp:K2",
            to: "syllabus:kp:K1",
            description: null,
            sourceType: "TEACHER",
            sourceRefs: [],
            confidence: null,
          },
        ],
      }),
    /环/u,
  );
});
