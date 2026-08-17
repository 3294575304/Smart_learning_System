import { GradeValueStatus } from "@prisma/client";

import type { QualityReportSourceSnapshot } from "@/services/quality-reports/schemas";

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
  outcomes: QualityReportSourceSnapshot["outcomes"];
  attendance: QualityReportSourceSnapshot["attendance"];
}

const INCLUDED_STATUS = GradeValueStatus.SCORED;
const round = (value: number, places = 2) => Number(value.toFixed(places));

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
    componentMeans: source.components.map((component) => {
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
    }),
    outcomes: source.outcomes,
    attendance: source.attendance,
  };
}

export function buildDeterministicNarrative(
  source: QualityReportSourceSnapshot,
  stats: QualityReportStatistics,
) {
  const formula = source.components
    .map(
      (component) => `${component.name}×${round(component.weight * 100, 2)}%`,
    )
    .join(" + ");
  const weakest = [...stats.componentMeans]
    .filter((item) => item.mean !== null)
    .sort((left, right) => left.mean! - right.mean!)[0];
  const below = stats.outcomes.filter(
    (item) =>
      item.attainmentIndex !== null && item.attainmentIndex < item.threshold,
  );
  return {
    gradeComposition: `总评成绩 = ${formula}。有效成绩 ${stats.participantCount} 人，特殊状态或缺失数据 ${stats.excludedCount} 人。`,
    gradeAnalysis:
      stats.mean === null
        ? "暂无可用于统计的有效成绩。"
        : `班级平均分 ${stats.mean.toFixed(2)}，及格率 ${((stats.passRate ?? 0) * 100).toFixed(1)}%，优秀率 ${((stats.excellentRate ?? 0) * 100).toFixed(1)}%。`,
    outcomeAnalysis: stats.outcomes.length
      ? below.length
        ? `${below.map((item) => item.code).join("、")} 低于各自达成阈值，应结合对应考核证据复核教学与评价设计。`
        : "现有课程目标均达到设定阈值，仍需结合分项成绩和学生反馈持续改进。"
      : "当前数据源未提供可核验的课程目标达成度，报告不作推断。",
    studentEvaluation: source.survey
      ? source.survey.isSuppressed
        ? `结课问卷收到 ${source.survey.responseCount}/${source.survey.eligibleCount} 份回答，低于 ${source.survey.minSampleSize} 份小样本阈值，因此不展示量表细分或开放题主题。学生自评不替代客观成绩与课程目标定量达成度。`
        : `结课问卷收到 ${source.survey.responseCount}/${source.survey.eligibleCount} 份回答，响应率 ${(source.survey.responseRate * 100).toFixed(1)}%，五级量表总体均值 ${source.survey.overallMean?.toFixed(2) ?? "暂无"}。${
            source.survey.outcomes.length
              ? `课程目标自评：${source.survey.outcomes.map((item) => `${item.code} ${item.mean.toFixed(2)}/5`).join("，")}。`
              : ""
          }${source.survey.themeNarrative}以上为学生定性自评，与客观达成度分开呈现。`
      : "暂无已关闭且完成聚合的课程问卷数据，学生评价留待教师补充；报告不作推断。",
    summary: weakest
      ? `成绩统计显示“${weakest.name}”平均分相对较低。建议针对该环节补充形成性反馈、典型错误讲评与分层练习，并在下一轮教学中复核改进效果。`
      : "建议补齐有效成绩和课程目标证据后再形成针对性改进措施。",
  };
}
