import type { QualityReportStatistics } from "@/services/quality-reports/calculation";
import type { QualityReportNarrative } from "@/services/quality-reports/docx-writer";
import {
  qualityReportAuditSchema,
  type QualityReportAudit,
  type QualityReportSourceSnapshot,
} from "@/services/quality-reports/schemas";

export const QUALITY_REPORT_AUDIT_RULE_VERSION = "quality-report-audit-v1";

type AuditIssue = QualityReportAudit["issues"][number];

function normalized(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/gu, "").toLowerCase();
}

function issue(
  code: string,
  severity: AuditIssue["severity"],
  category: AuditIssue["category"],
  title: string,
  message: string,
  action: string,
  relatedFields: string[],
): AuditIssue {
  return { code, severity, category, title, message, action, relatedFields };
}

function narrativeLooksGeneric(value: string) {
  return (
    value.trim().length < 45 ||
    /^(暂无|当前缺少|建议补齐|现有数据不足)/u.test(value.trim())
  );
}

export function auditQualityReportDraft(
  source: QualityReportSourceSnapshot,
  statistics: QualityReportStatistics,
  narrative: QualityReportNarrative,
  aiExecution?: { fallbackUsed: boolean; errorCode: string | null },
): QualityReportAudit {
  const issues: AuditIssue[] = [];
  const add = (...value: Parameters<typeof issue>) =>
    issues.push(issue(...value));

  if (!source.syllabus) {
    add(
      "SYLLABUS_NOT_PUBLISHED",
      "ERROR",
      "SYLLABUS",
      "缺少正式教学大纲来源",
      "本报告快照没有关联已发布教学大纲，无法核验课程目标、学分、课程性质和学院等基础字段。",
      "先完成教学大纲解析、教师审核和显式发布，再重新生成报告。",
      ["syllabus"],
    );
  } else {
    const reportName = normalized(source.course.name);
    const syllabusName = normalized(source.syllabus.courseName);
    if (reportName && syllabusName && reportName !== syllabusName) {
      add(
        "COURSE_NAME_MISMATCH",
        "WARNING",
        "SYLLABUS",
        "课程名称与正式大纲不一致",
        `系统课程名称“${source.course.name}”与正式大纲名称“${source.syllabus.courseName}”不一致，封面和正文口径可能不同。`,
        "核对课程名称；如仅为空格或简称差异，可在生成前统一课程信息。",
        ["course.name", "syllabus.courseName"],
      );
    }
    if (source.syllabus.objectiveCount === 0) {
      add(
        "SYLLABUS_OBJECTIVES_MISSING",
        "ERROR",
        "SYLLABUS",
        "正式教学大纲未识别课程目标",
        "已关联正式教学大纲，但其结构化版本没有课程目标，无法与报告目标达成分析建立来源对应。",
        "重新解析教学大纲，在原文—结构化结果审核页补齐课程目标并发布新版本。",
        ["syllabus.objectiveCount"],
      );
    }
    if (source.syllabus.assessmentCount === 0) {
      add(
        "SYLLABUS_ASSESSMENTS_MISSING",
        "ERROR",
        "SYLLABUS",
        "正式教学大纲未识别考核构成",
        "已关联正式教学大纲，但其结构化版本没有考核方式与权重，无法核验报告成绩构成。",
        "重新解析教学大纲，补齐考核方式、权重及其原文引用后发布新版本。",
        ["syllabus.assessmentCount"],
      );
    }
  }

  if (
    !source.course.courseNature.trim() ||
    source.course.courseNature === "未提供"
  ) {
    add(
      "COURSE_NATURE_MISSING",
      "WARNING",
      "COURSE_METADATA",
      "课程性质或类别缺失",
      "课程基本信息中的课程性质无法从正式大纲或生成表单确定。",
      "在大纲审核页补齐课程类别、课程性质，或在生成表单中明确填写。",
      ["course.courseNature", "syllabus.courseNature"],
    );
  }
  if (source.course.credits <= 0) {
    add(
      "COURSE_CREDITS_MISSING",
      "ERROR",
      "COURSE_METADATA",
      "学分缺失或为 0",
      "模板课程基本信息中的学分将显示 0.0，不能作为有效课程数据。",
      "在大纲审核页补齐学分并发布新正式版本，或在生成表单中填写有效学分。",
      ["course.credits", "syllabus.credits"],
    );
  }
  if (!source.course.college.trim()) {
    add(
      "COURSE_COLLEGE_MISSING",
      "WARNING",
      "COURSE_METADATA",
      "学院信息缺失",
      "报告封面学院栏将为空，课程基本信息无法完整对应开课单位。",
      "确认正式大纲中的授课学院，或在生成表单中补充学院。",
      ["course.college", "syllabus.teachingCollege"],
    );
  }
  if (!source.course.major.trim()) {
    add(
      "COURSE_MAJOR_MISSING",
      "WARNING",
      "COURSE_METADATA",
      "专业信息缺失",
      "报告封面专业栏将为空，无法说明课程适用专业。",
      "确认正式大纲中的适用专业，或在生成表单中补充本班实际专业。",
      ["course.major", "syllabus.applicableMajors"],
    );
  }
  if (!source.course.majorClass.trim() && !source.classroom.name.trim()) {
    add(
      "COURSE_CLASS_MISSING",
      "ERROR",
      "COURSE_METADATA",
      "专业、年级、班级信息缺失",
      "模板中的专业、年级、班级和封面班级字段均没有可用值。",
      "选择平台班级或在生成表单中填写“专业、年级、班级”。",
      ["course.majorClass", "classroom.name"],
    );
  }

  const weightTotal = source.components.reduce(
    (sum, component) => sum + component.weight,
    0,
  );
  if (Math.abs(weightTotal - 1) > 0.0001) {
    add(
      "ASSESSMENT_WEIGHT_TOTAL_INVALID",
      "ERROR",
      "ASSESSMENT",
      "成绩构成权重不是 100%",
      `本报告冻结的考核项目权重合计为 ${(weightTotal * 100).toFixed(2)}%。`,
      "返回正式考核方案核对各项目权重，发布正确版本后重新生成报告。",
      ["components.weight"],
    );
  }
  const missingComponentMeans = statistics.componentMeans.filter(
    (component) => component.mean === null,
  );
  if (missingComponentMeans.length > 0) {
    add(
      "ASSESSMENT_COMPONENT_SCORES_MISSING",
      "WARNING",
      "ASSESSMENT",
      "部分考核项目缺少有效分项成绩",
      `以下项目无法计算平均分：${missingComponentMeans.map((item) => item.name).join("、")}。`,
      "检查成绩台账分项数据、特殊状态和上传文件列映射。",
      ["students.componentScores"],
    );
  }

  if (statistics.outcomes.length === 0) {
    add(
      "COURSE_OBJECTIVES_MISSING",
      "ERROR",
      "OUTCOME_ATTAINMENT",
      "正式课程目标未进入报告",
      "报告无法展示课程目标原文、目标达成统计表、总体图和逐目标分析。",
      "发布含课程目标的教学大纲与考核方案，并重新生成报告。",
      ["outcomes", "syllabus.objectiveCount"],
    );
  } else {
    const missingAttainment = statistics.outcomes.filter(
      (outcome) =>
        outcome.attainmentIndex === null || outcome.threshold === null,
    );
    if (missingAttainment.length === statistics.outcomes.length) {
      add(
        "OUTCOME_ATTAINMENT_MISSING",
        "ERROR",
        "OUTCOME_ATTAINMENT",
        "缺少课程目标定量达成度",
        `已识别 ${statistics.outcomes.length} 项正式课程目标，但没有可核验的达成度与期望值，不能生成目标达成结论。`,
        "基于当前正式成绩发布生成课程目标达成度版本，再重新生成报告。",
        ["outcomes.attainmentIndex", "outcomes.threshold"],
      );
    } else if (missingAttainment.length > 0) {
      add(
        "OUTCOME_ATTAINMENT_PARTIAL",
        "ERROR",
        "OUTCOME_ATTAINMENT",
        "部分课程目标缺少达成度",
        `以下目标缺少达成度或期望值：${missingAttainment.map((item) => item.code).join("、")}。`,
        "补齐对应考核证据并重新计算课程目标达成度。",
        ["outcomes.attainmentIndex", "outcomes.threshold"],
      );
    }
    const allocationMissing = statistics.outcomes.filter((outcome) => {
      const codes = new Set(
        (outcome.componentAllocations ?? []).map((item) => item.componentCode),
      );
      return source.components.some((component) => !codes.has(component.code));
    });
    if (allocationMissing.length > 0) {
      add(
        "OUTCOME_ALLOCATION_MISSING",
        "WARNING",
        "OUTCOME_ATTAINMENT",
        "课程目标—考核方式占比不完整",
        `目标 ${allocationMissing.map((item) => item.code).join("、")} 的定量表将出现“—”，无法对照大纲中的目标—考核方式占比。`,
        "在正式考核方案中补齐每个目标在各考核方式中的占比并重新发布。",
        ["outcomes.componentAllocations"],
      );
    }
    const scoresMissing = statistics.outcomes.filter(
      (outcome) => !outcome.studentScores?.length,
    );
    if (scoresMissing.length > 0) {
      add(
        "OUTCOME_STUDENT_EVIDENCE_MISSING",
        "WARNING",
        "OUTCOME_ATTAINMENT",
        "逐学生目标达成证据不完整",
        `目标 ${scoresMissing.map((item) => item.code).join("、")} 无法生成逐学生达成度分布图。`,
        "确认目标达成度计算包含当前成绩发布中的学生明细。",
        ["outcomes.studentScores"],
      );
    }
  }

  if (!source.survey) {
    add(
      "SURVEY_MISSING",
      "WARNING",
      "SURVEY",
      "缺少已关闭的结课问卷汇总",
      "学生评价、课程目标自评以及主客观结果对照只能留待教师补充。",
      "发布并关闭本班结课问卷，生成聚合汇总后重新生成报告。",
      ["survey"],
    );
  } else if (source.survey.isSuppressed) {
    add(
      "SURVEY_SMALL_SAMPLE_SUPPRESSED",
      "INFO",
      "SURVEY",
      "问卷小样本统计已受保护",
      `问卷仅收到 ${source.survey.responseCount} 份回答，低于 ${source.survey.minSampleSize} 份阈值，细分统计和开放题主题不会展示。`,
      "可继续保留隐私保护提示；如需完整统计，应提高响应数后重新关闭并汇总问卷。",
      ["survey.responseCount", "survey.minSampleSize"],
    );
  }

  if (
    source.attendance.sessionCount === 0 ||
    source.attendance.presentRate === null
  ) {
    add(
      "ATTENDANCE_MISSING",
      "INFO",
      "ATTENDANCE",
      "没有可用的出勤汇总",
      "课程总结无法使用出勤作为独立学习投入证据。",
      "如本课程使用平台签到，请先关闭签到场次并完成必要纠正。",
      ["attendance"],
    );
  }

  if (aiExecution?.fallbackUsed) {
    add(
      "AI_NARRATIVE_FALLBACK",
      "WARNING",
      "AI_NARRATIVE",
      "AI 分析未成功，已使用确定性基础文字",
      `AI 生成未通过或不可用（${aiExecution.errorCode ?? "未知原因"}），当前文字不会编造数据，但分析深度有限。`,
      "教师应逐项补充分析；也可检查 AI 配置后生成新报告版本。",
      ["narrative"],
    );
  }
  const genericSections = [
    ["成绩分析", narrative.gradeAnalysis],
    ["课程目标总体分析", narrative.outcomeAnalysis],
    ["学生评价概括", narrative.studentEvaluation],
    ["课程总结", narrative.courseSummary],
    ["持续改进措施", narrative.improvementMeasures],
  ].filter(([, value]) => narrativeLooksGeneric(value));
  if (genericSections.length > 0) {
    add(
      "NARRATIVE_INSUFFICIENT",
      "WARNING",
      "AI_NARRATIVE",
      "部分分析文字过短或仅陈述数据缺口",
      `需要教师重点补充：${genericSections.map(([name]) => name).join("、")}。`,
      "在人工审核区补充基于现有统计的判断、证据边界和可验证的改进措施；不得虚构缺失数据。",
      genericSections.map(([name]) => `narrative.${name}`),
    );
  }

  const errors = issues.filter((item) => item.severity === "ERROR").length;
  const warnings = issues.filter((item) => item.severity === "WARNING").length;
  const info = issues.filter((item) => item.severity === "INFO").length;
  return qualityReportAuditSchema.parse({
    ruleVersion: QUALITY_REPORT_AUDIT_RULE_VERSION,
    status: errors ? "INCOMPLETE" : warnings ? "NEEDS_REVIEW" : "READY",
    issues,
    counts: { errors, warnings, info },
  });
}
