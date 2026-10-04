import { GradeValueStatus } from "@prisma/client";

import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";
import {
  buildGradeComposition,
  normalizeQualityReportNarrative,
} from "@/services/quality-reports/presentation";

export type QualityReportOutcomeStatistics =
  QualityReportSourceSnapshot["outcomes"][number] & {
    weightedAverage: number | null;
    weightedMaximum: number | null;
    computedAttainmentIndex: number | null;
    aboveHighCount: number;
    aboveHighRate: number | null;
    aboveThresholdCount: number;
    aboveThresholdRate: number | null;
    median: number | null;
    minimum: number | null;
    maximum: number | null;
    surveyMean: number | null;
    surveyNormalized: number | null;
    surveyResponseCount: number | null;
  };

export interface QualityReportStatistics {
  participantCount: number;
  excludedCount: number;
  mean: number | null;
  passRate: number | null;
  excellentRate: number | null;
  distribution: Array<{ label: string; count: number; ratio: number }>;
  componentMeans: Array<{
    code: string;
    name: string;
    weight: number;
    mean: number | null;
  }>;
  outcomes: QualityReportOutcomeStatistics[];
  attendance: QualityReportSourceSnapshot["attendance"];
}

const INCLUDED_STATUS = GradeValueStatus.SCORED;
const round = (value: number, places = 2) => Number(value.toFixed(places));

function normalizeOutcomeScore(value: number) {
  return Math.abs(value) > 1.5 ? value / 100 : value;
}

function normalizeOutcomeCode(value: string) {
  return value.normalize("NFKC").replace(/\s+/gu, "").toLowerCase();
}

function median(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function calculateQualityReportStatistics(
  source: QualityReportSourceSnapshot,
): QualityReportStatistics {
  const included = source.students.filter(
    (student) =>
      student.status === INCLUDED_STATUS && student.totalScore !== null,
  );
  const scores = included.map((student) => student.totalScore!);
  const count = scores.length;
  const ranges = [
    { label: "90-100", test: (score: number) => score >= 90 },
    { label: "80-89", test: (score: number) => score >= 80 && score < 90 },
    { label: "70-79", test: (score: number) => score >= 70 && score < 80 },
    { label: "60-69", test: (score: number) => score >= 60 && score < 70 },
    { label: "<60", test: (score: number) => score < 60 },
  ];
  const componentMeans = source.components.map((component) => {
    const values = included
      .map((student) => student.componentScores[component.code])
      .filter(
        (value): value is number => value !== null && value !== undefined,
      );
    return {
      ...component,
      mean: values.length
        ? round(values.reduce((sum, value) => sum + value, 0) / values.length)
        : null,
    };
  });
  const surveyByOutcome = new Map(
    source.survey && !source.survey.isSuppressed
      ? source.survey.outcomes.map(
          (item) => [normalizeOutcomeCode(item.code), item] as const,
        )
      : [],
  );
  const outcomes = source.outcomes.map((outcome) => {
    const allocationByCode = new Map(
      (outcome.componentAllocations ?? []).map((allocation) => [
        allocation.componentCode,
        allocation.allocationRate,
      ]),
    );
    const weightedParts = componentMeans.flatMap((component) => {
      const allocationRate = allocationByCode.get(component.code);
      return allocationRate === undefined || component.mean === null
        ? []
        : [
            {
              average: component.mean * component.weight * allocationRate,
              maximum: 100 * component.weight * allocationRate,
            },
          ];
    });
    const hasCompleteWeights = weightedParts.length === componentMeans.length;
    const weightedAverage = hasCompleteWeights
      ? round(
          weightedParts.reduce((sum, item) => sum + item.average, 0),
          4,
        )
      : null;
    const weightedMaximum = hasCompleteWeights
      ? round(
          weightedParts.reduce((sum, item) => sum + item.maximum, 0),
          4,
        )
      : null;
    const normalizedScores = (outcome.studentScores ?? []).map(
      normalizeOutcomeScore,
    );
    const aboveHighCount = normalizedScores.filter(
      (value) => value >= 0.8,
    ).length;
    const threshold = outcome.threshold;
    const aboveThresholdCount =
      threshold === null
        ? 0
        : normalizedScores.filter((value) => value >= threshold).length;
    const survey = surveyByOutcome.get(normalizeOutcomeCode(outcome.code));
    return {
      ...outcome,
      weightedAverage,
      weightedMaximum,
      computedAttainmentIndex:
        weightedAverage === null || !weightedMaximum
          ? null
          : round(weightedAverage / weightedMaximum, 4),
      aboveHighCount,
      aboveHighRate: normalizedScores.length
        ? round(aboveHighCount / normalizedScores.length, 4)
        : null,
      aboveThresholdCount,
      aboveThresholdRate:
        normalizedScores.length && outcome.threshold !== null
          ? round(aboveThresholdCount / normalizedScores.length, 4)
          : null,
      median:
        normalizedScores.length > 0
          ? round(median(normalizedScores)!, 4)
          : null,
      minimum: normalizedScores.length
        ? round(Math.min(...normalizedScores), 4)
        : null,
      maximum: normalizedScores.length
        ? round(Math.max(...normalizedScores), 4)
        : null,
      surveyMean: survey?.mean ?? null,
      surveyNormalized: survey ? round(survey.mean / 5, 4) : null,
      surveyResponseCount: survey?.count ?? null,
    };
  });
  return {
    participantCount: count,
    excludedCount: source.students.length - count,
    mean: count
      ? round(scores.reduce((sum, score) => sum + score, 0) / count)
      : null,
    passRate: count
      ? round(scores.filter((score) => score >= 60).length / count, 4)
      : null,
    excellentRate: count
      ? round(scores.filter((score) => score >= 90).length / count, 4)
      : null,
    distribution: ranges.map((range) => {
      const rangeCount = scores.filter(range.test).length;
      return {
        label: range.label,
        count: rangeCount,
        ratio: count ? round(rangeCount / count, 4) : 0,
      };
    }),
    componentMeans,
    outcomes,
    attendance: source.attendance,
  };
}

function buildStudentEvaluation(source: QualityReportSourceSnapshot) {
  const survey = source.survey;
  if (!survey) return "学生评价待补充。";
  if (survey.isSuppressed) return "问卷反馈较少，暂不作总体评价。";
  const positive = survey.dimensions.filter(
    (item) => item.count > 0 && item.title && item.mean >= 4,
  );
  const needsAttention = survey.dimensions.filter(
    (item) => item.count > 0 && item.title && item.mean < 3,
  );
  const comments = [
    positive.length
      ? `问卷中，学生对${positive.map((item) => item.title).join("、")}的评价较好。`
      : "",
    needsAttention.length
      ? `学生对${needsAttention.map((item) => item.title).join("、")}的评价偏低，后续教学需要重视这些方面的意见。`
      : "",
    survey.themes.length
      ? `学生反馈涉及${survey.themes
          .slice(0, 3)
          .map((item) => item.label)
          .join("、")}。`
      : "",
  ].filter(Boolean);
  const overall = survey.overallMean;
  if (overall !== null) {
    comments.push(
      overall >= 4
        ? "总体上，参与问卷的学生对本课程评价良好。"
        : overall >= 3
          ? "总体上，参与问卷的学生对本课程评价尚可，教学内容与学习支持仍有改进空间。"
          : "总体上，参与问卷的学生对本课程评价偏低，需要进一步了解学习中的困难，调整教学安排。",
    );
  }
  return comments.join("\n") || "学生评价待补充。";
}

export function buildDeterministicNarrative(
  source: QualityReportSourceSnapshot,
  stats: QualityReportStatistics,
) {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const ranked = stats.componentMeans
    .filter((item) => item.mean !== null)
    .sort((left, right) => (left.mean ?? 0) - (right.mean ?? 0));
  const weakest = ranked[0];
  const strongest = ranked[ranked.length - 1];
  const hasDifference = weakest && strongest && weakest.mean !== strongest.mean;
  const evaluated = stats.outcomes.filter(
    (item) => item.attainmentIndex !== null && item.threshold !== null,
  );
  const below = evaluated.filter(
    (item) => (item.attainmentIndex ?? 0) < (item.threshold ?? 0),
  );
  const missing = stats.outcomes.filter(
    (item) => item.attainmentIndex === null || item.threshold === null,
  );
  const label = (item: { code: string }) =>
    `课程目标${source.outcomes.findIndex((outcome) => outcome.code === item.code) + 1}`;
  const outcomeAnalysis = !evaluated.length
    ? "课程目标达成情况待补充。"
    : `${
        below.length
          ? `${below.map(label).join("、")}尚未达到期望值，相关学习内容仍需加强。`
          : "各项已完成评价的课程目标均达到期望值，课程总体学习要求基本达成。"
      }${missing.length ? `${missing.map(label).join("、")}的达成情况待补充。` : ""}`;
  const gradeAnalysis =
    stats.mean === null
      ? "成绩分析待补充。"
      : `班级总评平均分为${stats.mean.toFixed(2)}分。${
          hasDifference
            ? `分项考核中，学生在“${strongest.name}”环节的成绩相对较好，“${weakest.name}”环节相对薄弱，后续应加强相关内容的讲解与练习。`
            : "后续教学可结合各分数段学生的作答情况安排讲评与练习，帮助学生巩固所学内容。"
        }${stats.passRate !== null && stats.passRate < 1 ? "对尚未及格的学生，应及时了解学习困难，安排有针对性的辅导。" : ""}`;
  const outcomeDetails = stats.outcomes.map((item) => ({
    code: item.code,
    analysis:
      item.attainmentIndex === null || item.threshold === null
        ? `${label(item)}的达成情况待补充。`
        : `${label(item)}的达成度为${item.attainmentIndex.toFixed(2)}，${item.attainmentIndex >= item.threshold ? "达到" : "未达到"}期望值${item.threshold.toFixed(2)}。${item.aboveThresholdRate === null ? "" : `达到期望值的学生占${percent(item.aboveThresholdRate)}。`}${
            item.attainmentIndex >= item.threshold
              ? `班级整体达到该目标的学习要求，后续可围绕“${item.title}”安排巩固与拓展练习。`
              : `后续应围绕“${item.title}”安排重点讲解和分步练习，帮助学生逐步达到课程要求。`
          }`,
  }));
  const studentEvaluation = buildStudentEvaluation(source);
  const assessments = source.syllabus?.assessments;
  const assessmentMatches =
    assessments?.length === source.components.length &&
    assessments.every((assessment) =>
      source.components.some(
        (component) =>
          component.code === assessment.code &&
          component.name === assessment.name &&
          Math.abs(component.weight - assessment.weight) < 0.000001,
      ),
    );
  const mapped =
    source.outcomes.length > 0 &&
    source.outcomes.every(
      (outcome) => (outcome.componentAllocations?.length ?? 0) > 0,
    );
  const comparable =
    source.survey && !source.survey.isSuppressed
      ? stats.outcomes.filter(
          (item) =>
            item.attainmentIndex !== null && item.surveyNormalized !== null,
        )
      : [];
  const comparison = comparable.length
    ? comparable
        .map(
          (item) =>
            `${label(item)}客观达成度${item.attainmentIndex?.toFixed(2)}、学生自评${item.surveyNormalized?.toFixed(2)}`,
        )
        .join("；") +
      "。自评反映学生的学习感受，应结合目标要求与具体作答解释差异，不能直接视为客观掌握水平。"
    : source.survey?.isSuppressed
      ? "问卷反馈较少，暂不开展目标达成与学生评价的比较。"
      : "尚无可对应课程目标的学生评价，需补充后比较学习表现与学生感受。";
  const summary = [
    `教学内容与授课方式：${source.syllabus?.teachingContent?.length ? `正式大纲涵盖${source.syllabus.teachingContent.slice(0, 3).join("、")}等内容。` : "需结合正式大纲核对教学内容对课程目标的覆盖。"}${evaluated.length ? "目标评价可用于判断整体学习要求的落实情况；" : "当前目标达成资料尚不完整；"}实际授课方式及其支撑效果仍需教师结合教学实施情况核实。`,
    `考核与评分标准：${assessments?.length ? (assessmentMatches ? "当前考核项目及权重与正式大纲一致。" : "当前考核项目或权重与正式大纲存在差异，需核对后说明。") : "尚缺正式大纲考核信息，不能确认考核一致性。"}${mapped ? "已配置考核项目与课程目标的对应关系。" : "考核与课程目标的对应关系需进一步核实。"}评分标准是否明确、合理，需教师结合实际评分细则与执行情况确认。`,
    `课程目标达成：${outcomeAnalysis}${hasDifference ? `“${weakest.name}”环节表现相对薄弱，宜结合目标要求检查相关学习困难。` : "后续应结合目标对应的作答情况开展巩固与反馈。"}`,
    `达成情况与学生评价比较：${comparison}`,
  ];
  const measures =
    stats.mean === null && !evaluated.length
      ? []
      : [
          hasDifference
            ? `针对“${weakest.name}”环节，整理学生作答中的典型问题，安排专题讲评和由易到难的练习。讲评后让学生独立订正，并及时反馈仍未解决的问题。`
            : "结合学生作答中的典型问题安排讲评，将基础练习与综合任务衔接，帮助学生在独立完成任务的过程中巩固课程知识。",
          below.length
            ? `围绕${below.map(label).join("、")}对应的学习内容，细化练习步骤，增加示范与独立练习的衔接，帮助学生逐步达到课程要求。`
            : "结合课程目标设计递进任务，在基础练习之后增加知识综合运用的机会，并根据学生完成情况调整讲解重点。",
          "根据学生不同的学习基础提供分层练习和答疑辅导，及时回应学习中的疑问，帮助学生形成适合自己的学习方法。",
        ];
  return normalizeQualityReportNarrative(
    {
      gradeComposition: buildGradeComposition(
        source.syllabus?.assessments ?? source.components,
      ),
      gradeAnalysis,
      outcomeAnalysis,
      outcomeDetails,
      studentEvaluation,
      courseSummary: summary.length
        ? summary.map((text, index) => `${index + 1}. ${text}`).join("\n")
        : "课程总结待补充。",
      improvementMeasures: measures.length
        ? measures.map((text, index) => `${index + 1}. ${text}`).join("\n")
        : "持续改进措施待补充。",
    },
    source.outcomes,
  );
}
