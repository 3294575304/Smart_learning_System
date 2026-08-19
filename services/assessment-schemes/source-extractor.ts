import { AssessmentComponentType } from "@prisma/client";

import type { ExtractedPdfPage } from "@/services/syllabus-parsing/pdf-extractor";
import { extractObjectiveAssessmentMatrix } from "@/services/syllabus-parsing/objective-assessment-matrix";
import type { SyllabusParseOutput } from "@/services/syllabus-parsing/schemas";
import type { AssessmentSchemeStructure } from "@/services/assessment-schemes/schemas";

function componentType(value: string): AssessmentComponentType {
  const normalized = value.replace(/\s+/gu, "");
  if (/平时|课堂表现/u.test(normalized)) {
    return AssessmentComponentType.REGULAR_PERFORMANCE;
  }
  if (/作业/u.test(normalized)) {
    return AssessmentComponentType.COURSE_ASSIGNMENT;
  }
  if (/期中/u.test(normalized)) return AssessmentComponentType.MIDTERM_EXAM;
  if (/实验|实践/u.test(normalized)) {
    return AssessmentComponentType.COURSE_EXPERIMENT;
  }
  if (/期末/u.test(normalized)) return AssessmentComponentType.FINAL_EXAM;
  if (/考勤|出勤|签到/u.test(normalized)) {
    return AssessmentComponentType.ATTENDANCE;
  }
  return AssessmentComponentType.OTHER;
}

function structuredMappingPercentages(
  syllabus: SyllabusParseOutput,
): { values: number[]; sourcePages: number[] } | null {
  const byPair = new Map(
    syllabus.objectiveAssessmentMappings.map((mapping) => [
      `${mapping.objectiveCode}\u0000${mapping.assessmentCode}`,
      mapping,
    ]),
  );
  const ordered = syllabus.objectives.flatMap((objective) =>
    syllabus.assessments.map((assessment) =>
      byPair.get(`${objective.code}\u0000${assessment.code}`),
    ),
  );
  if (
    ordered.length === 0 ||
    ordered.some((mapping) => !mapping || mapping.allocationRate === null)
  ) {
    return null;
  }
  const values = ordered.map((mapping) => mapping?.allocationRate ?? 0);
  for (
    let assessmentIndex = 0;
    assessmentIndex < syllabus.assessments.length;
    assessmentIndex += 1
  ) {
    const total = syllabus.objectives.reduce(
      (sum, _objective, objectiveIndex) =>
        sum +
        (values[
          objectiveIndex * syllabus.assessments.length + assessmentIndex
        ] ?? 0),
      0,
    );
    if (Math.abs(total - 100) > 0.000001) return null;
  }
  return {
    values,
    sourcePages: [
      ...new Set(
        ordered.flatMap((mapping) =>
          (mapping?.sourceRefs ?? []).map((ref) => ref.page),
        ),
      ),
    ],
  };
}

function gradingBands(pages: readonly ExtractedPdfPage[]) {
  const relevant = pages.filter((page) =>
    /90\s*[-—~～]\s*100/u.test(page.text),
  );
  const joined = relevant.map((page) => page.text).join(" ");
  if (
    !/90\s*[-—~～]\s*100/u.test(joined) ||
    !/80\s*[-—~～]\s*89/u.test(joined) ||
    !/70\s*[-—~～]\s*79/u.test(joined) ||
    !/60\s*[-—~～]\s*69/u.test(joined) ||
    !/0\s*[-—~～]\s*59/u.test(joined)
  ) {
    return null;
  }
  const sourceRefs = relevant.slice(0, 6).map((page) => ({
    page: page.pageNumber,
    quote: "考核方式评分标准分档：90-100、80-89、70-79、60-69、0-59",
    verified: true,
  }));
  return {
    threshold: 60,
    fullScore: 100,
    bands: [
      { minScore: 90, maxScore: 100, label: "优", sourceRefs },
      { minScore: 80, maxScore: 89, label: "良", sourceRefs },
      { minScore: 70, maxScore: 79, label: "中", sourceRefs },
      { minScore: 60, maxScore: 69, label: "及格", sourceRefs },
      { minScore: 0, maxScore: 59, label: "不及格", sourceRefs },
    ],
  };
}

export function buildAssessmentSchemeFromSyllabus(
  syllabus: SyllabusParseOutput,
  pages: readonly ExtractedPdfPage[],
): AssessmentSchemeStructure {
  const mapping =
    structuredMappingPercentages(syllabus) ??
    extractObjectiveAssessmentMatrix(
      pages,
      syllabus.objectives.length,
      syllabus.assessments.length,
    );
  const rubric = gradingBands(pages);
  const warnings: string[] = [];
  if (!mapping && syllabus.objectiveAssessmentMappings.length > 0) {
    warnings.push(
      "正式大纲结构包含课程目标关联，但未能从原文确定性提取数值比例，请教师对照原文补充。",
    );
  }
  if (!rubric) {
    warnings.push(
      "未能从正式大纲原文确定性提取完整评分分档，满分和达成阈值需要教师补充。",
    );
  }
  const mappingRefs = (mapping?.sourcePages ?? []).map((page, index) => ({
    page,
    ...(index === 0 ? { quote: "课程目标在各考核方式中占比" } : {}),
    verified: true,
  }));
  return {
    outcomes: syllabus.objectives.map((objective, index) => ({
      code: objective.code,
      title: objective.title,
      description: objective.description,
      attainmentThreshold: rubric?.threshold ?? null,
      sortOrder: index + 1,
      sourceRefs: objective.sourceRefs,
    })),
    components: syllabus.assessments.map((assessment, assessmentIndex) => {
      const explicitMappings = new Set(
        syllabus.objectiveAssessmentMappings
          .filter((item) => item.assessmentCode === assessment.code)
          .map((item) => item.objectiveCode),
      );
      return {
        code: assessment.code,
        name: assessment.name,
        type: componentType(`${assessment.type} ${assessment.name}`),
        fullScore: rubric?.fullScore ?? null,
        weight: assessment.weight,
        sourceType: null,
        sortOrder: assessmentIndex + 1,
        enabled: true,
        description: assessment.description,
        sourceRefs: assessment.sourceRefs,
        mappings: syllabus.objectives
          .filter(
            (objective) =>
              explicitMappings.has(objective.code) || mapping !== null,
          )
          .map((objective, objectiveIndex) => ({
            objectiveCode: objective.code,
            allocationRate:
              mapping?.values[
                objectiveIndex * syllabus.assessments.length + assessmentIndex
              ] ?? null,
            sourceRefs: mappingRefs,
          })),
        rubricBands: rubric?.bands ?? [],
      };
    }),
    warnings: [...syllabus.warnings, ...warnings],
  };
}

export function emptyAssessmentScheme(): AssessmentSchemeStructure {
  return {
    outcomes: [],
    components: [],
    warnings: [
      "当前课程没有可用的正式教学大纲结构，已创建空白草稿；系统未生成任何虚构来源。",
    ],
  };
}
