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
  const percent = (value: number | null) =>
    value === null ? "暂无" : `${(value * 100).toFixed(1)}%`;
  const formula = source.components
    .map(
      (component) => `${component.name}×${round(component.weight * 100, 2)}%`,
    )
    .join(" + ");
  const weakest = [...stats.componentMeans]
    .filter((item) => item.mean !== null)
    .sort((left, right) => (left.mean ?? 0) - (right.mean ?? 0))[0];
  const strongest = [...stats.componentMeans]
    .filter((item) => item.mean !== null)
    .sort((left, right) => (right.mean ?? 0) - (left.mean ?? 0))[0];
  const distributionSummary = stats.distribution
    .map(
      (item) =>
        `${item.label} 分 ${item.count} 人（${(item.ratio * 100).toFixed(1)}%）`,
    )
    .join("，");
  const componentSummary = stats.componentMeans
    .map(
      (item) =>
        `${item.name}（权重 ${(item.weight * 100).toFixed(1)}%，平均分 ${item.mean?.toFixed(2) ?? "暂无"}）`,
    )
    .join("，");
  const evaluated = stats.outcomes.filter(
    (item) => item.attainmentIndex !== null && item.threshold !== null,
  );
  const below = evaluated.filter(
    (item) => item.attainmentIndex! < item.threshold!,
  );
  const missingOutcomes = stats.outcomes.filter(
    (item) => item.attainmentIndex === null || item.threshold === null,
  );
  const outcomeDetails = stats.outcomes.map((item) => {
    const allocationByCode = new Map(
      (item.componentAllocations ?? []).map((allocation) => [
        allocation.componentCode,
        allocation.allocationRate,
      ]),
    );
    const evidence = source.components
      .map((component) => ({
        name: component.name,
        contribution:
          component.weight * (allocationByCode.get(component.code) ?? 0),
      }))
      .filter((entry) => entry.contribution > 0)
      .sort((left, right) => right.contribution - left.contribution);
    const evidenceSummary = evidence.length
      ? `主要量化证据来自${evidence
          .slice(0, 3)
          .map((entry) => entry.name)
          .join("、")}等考核环节。`
      : "当前目标与考核环节的数值映射不完整。";
    return {
      code: item.code,
      analysis:
        item.attainmentIndex === null || item.threshold === null
          ? `课程目标 ${item.code}（${item.title}）已从正式课程结构识别，但暂无完整的达成度与期望值。${evidenceSummary}需补齐可核验的考核证据后再形成达成结论。`
          : `课程目标 ${item.code}（${item.title}）的达成度为 ${item.attainmentIndex.toFixed(2)}，期望值为 ${item.threshold.toFixed(2)}，纳入 ${item.participantCount} 名有效学生，${
              item.attainmentIndex >= item.threshold
                ? `高于期望值 ${(item.attainmentIndex - item.threshold).toFixed(2)}`
                : `低于期望值 ${(item.threshold - item.attainmentIndex).toFixed(2)}`
            }。${evidenceSummary}该结果应结合分项成绩、学生反馈及教学实施记录复核，并在下一轮同口径考核中验证变化。`,
    };
  });
  return {
    gradeComposition: `总评成绩 = ${formula}。有效成绩 ${stats.participantCount} 人，特殊状态或缺失数据 ${stats.excludedCount} 人。`,
    gradeAnalysis:
      stats.mean === null
        ? "暂无可用于统计的有效成绩。"
        : `本次纳入 ${stats.participantCount} 名有效学生，班级平均分 ${stats.mean.toFixed(2)}，及格率 ${percent(stats.passRate)}，优秀率 ${percent(stats.excellentRate)}。成绩分布为：${distributionSummary}。分项统计为：${componentSummary}。${strongest ? `其中“${strongest.name}”平均分最高（${strongest.mean?.toFixed(2)}）` : ""}${weakest ? `，“${weakest.name}”平均分最低（${weakest.mean?.toFixed(2)}）` : ""}；上述差异用于定位需复核的考核环节，不直接推断教学因果。`,
    outcomeAnalysis:
      stats.outcomes.length === 0
        ? "当前数据源未提供正式课程目标，无法形成课程目标达成分析。"
        : evaluated.length === 0
          ? `已识别 ${stats.outcomes.length} 项正式课程目标，但当前没有可核验的定量达成度与期望值，报告不作达成结论。`
          : `${
              below.length
                ? `${below.map((item) => `${item.code}（${item.attainmentIndex!.toFixed(2)}/${item.threshold!.toFixed(2)}）`).join("、")} 低于各自达成阈值，应结合对应考核证据复核教学与评价设计。`
                : `已有定量结果的课程目标均达到设定阈值：${evaluated.map((item) => `${item.code} ${item.attainmentIndex!.toFixed(2)}/${item.threshold!.toFixed(2)}`).join("，")}。仍需结合分项成绩、学生反馈和不同目标的相对差异持续改进。`
            }${
              missingOutcomes.length
                ? ` ${missingOutcomes.map((item) => item.code).join("、")} 缺少完整达成数据，不纳入上述判断。`
                : ""
            }`,
    outcomeDetails,
    studentEvaluation: source.survey
      ? source.survey.isSuppressed
        ? `结课问卷收到 ${source.survey.responseCount}/${source.survey.eligibleCount} 份回答，低于 ${source.survey.minSampleSize} 份小样本阈值，因此不展示量表细分或开放题主题。学生自评不替代客观成绩与课程目标定量达成度。`
        : `结课问卷收到 ${source.survey.responseCount}/${source.survey.eligibleCount} 份回答，响应率 ${(source.survey.responseRate * 100).toFixed(1)}%，五级量表总体均值 ${source.survey.overallMean?.toFixed(2) ?? "暂无"}。${
            source.survey.outcomes.length
              ? `课程目标自评：${source.survey.outcomes.map((item) => `${item.code} ${item.mean.toFixed(2)}/5`).join("，")}。`
              : ""
          }${source.survey.themeNarrative}以上为学生定性自评，与客观达成度分开呈现。`
      : "暂无已关闭且完成聚合的课程问卷数据，学生评价留待教师补充；报告不作推断。",
    courseSummary:
      stats.mean === null
        ? "当前缺少可用于课程质量分析的有效成绩，暂不形成确定性质量结论。"
        : `本次统计纳入 ${stats.participantCount} 名学生，班级平均分为 ${stats.mean.toFixed(2)}，及格率为 ${percent(stats.passRate)}，优秀率为 ${percent(stats.excellentRate)}。${evaluated.length ? `${evaluated.length} 项课程目标具有可核验定量结果，其中 ${evaluated.length - below.length} 项达到期望值。` : "当前课程目标尚无完整定量结果。"}${source.survey ? `结课问卷响应率为 ${percent(source.survey.responseRate)}，学生自评作为独立定性证据。` : "当前未纳入结课问卷汇总。"}${stats.attendance.presentRate === null ? "当前未纳入有效出勤汇总。" : `出勤到课率为 ${percent(stats.attendance.presentRate)}。`}各类证据口径分开呈现，结论限于本次冻结的数据快照。`,
    improvementMeasures: weakest
      ? `第一，针对“${weakest.name}”平均分相对最低的现象，按知识点归类典型错误，增加讲评、即时反馈和分层练习；下一轮以该环节平均分、低分段人数及相同题型正确率验证。第二，围绕${below.length ? `${below.map((item) => item.code).join("、")} 未达期望值` : "各课程目标已达期望值但仍有差异"}，按目标—考核方式占比复核试题覆盖、评分标准和教学活动的一致性；以同口径目标达成度及有效样本数验证。第三，${source.survey ? "结合问卷中学生自评与客观成绩的差异安排访谈或针对性学习支持" : "补充结课问卷并收集学生对内容难点、教学活动和考核方式的反馈"}；下一轮同时比较问卷响应率、自评均值与客观达成度，不以单一证据替代综合判断。`
      : "建议补齐有效成绩和课程目标证据后再形成针对性改进措施。",
  };
}
