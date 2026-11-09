import { withClassroomQuery } from "@/lib/course-classroom";

export function courseEvaluationNextStep(input: {
  courseId: string;
  classroom: { id: string; name: string } | null;
  hasClassrooms: boolean;
  hasPublishedScheme: boolean;
  hasOutcomeMappings: boolean;
  includeReport?: boolean;
  gradebook: {
    id: string;
    currentPublication: { versionNumber: number } | null;
  } | null;
  unpublishedChanges: boolean;
  report: {
    id: string;
    versionNumber: number;
    status: "QUEUED" | "PROCESSING" | "SUCCEEDED" | "FAILED";
    reviewStatus: "PENDING_REVIEW" | "APPROVED";
  } | null;
}) {
  const { courseId, classroom, gradebook, report } = input;
  const coursePath = `/teacher/courses/${courseId}`;
  if (!classroom)
    return input.hasClassrooms
      ? { detail: "请在上方选择班级，查看该班的台账和报告进度。", action: null }
      : null;

  const step = (detail: string, label: string, href: string) => ({
    detail: `${classroom.name} · ${detail}`,
    action: { label, href: withClassroomQuery(href, classroom.id) },
  });
  if (!input.hasPublishedScheme)
    return step(
      "发布正式考核方案后，即可建立成绩台账。",
      "查看考核方案",
      `${coursePath}/assessment-scheme`,
    );
  if (!gradebook)
    return step(
      "正式考核方案已发布。建立成绩台账后，可同步已公布的成绩或录入分项成绩。",
      "建立成绩台账",
      `${coursePath}/gradebook`,
    );
  const publication = gradebook.currentPublication;
  if (!publication || input.unpublishedChanges)
    return step(
      publication
        ? `台账有未发布的成绩修改。核对后可发布新版本，报告仍使用正式成绩 v${publication.versionNumber}。`
        : "成绩台账尚未发布。请核对分项成绩与特殊状态后发布正式成绩。",
      "核对成绩台账",
      `${coursePath}/gradebook/${gradebook.id}`,
    );
  if (input.includeReport === false)
    return step(
      `正式成绩 v${publication.versionNumber} 已发布，可查看台账或导出成绩工作簿。`,
      "查看成绩台账",
      `${coursePath}/gradebook/${gradebook.id}`,
    );

  const reportPath = `${coursePath}/quality-report`;
  if (!report && !input.hasOutcomeMappings)
    return step(
      "正式成绩已发布。请先在考核方案中核对大纲课程目标与考核映射，再生成报告。",
      "核对考核方案",
      `${coursePath}/assessment-scheme`,
    );
  if (!report)
    return step(
      `可使用正式成绩 v${publication.versionNumber} 生成教学质量分析报告。`,
      "生成分析报告",
      `${reportPath}?gradebookId=${encodeURIComponent(gradebook.id)}#quality-report-create`,
    );
  const reportLink = `${reportPath}?reportId=${encodeURIComponent(report.id)}`;
  if (report.status === "QUEUED" || report.status === "PROCESSING")
    return step("报告正在后台生成。", "查看生成进度", reportLink);
  if (report.status === "FAILED")
    return step(
      "报告生成失败。可查看生成记录并重新提交。",
      "查看生成记录",
      reportLink,
    );
  if (report.reviewStatus === "PENDING_REVIEW")
    return step(
      `报告 v${report.versionNumber} 的分析初稿已生成，请核对统计和分析内容。`,
      "查看并审核报告",
      reportLink,
    );
  return step(
    `报告 v${report.versionNumber} 已审核，可下载正式 DOCX。`,
    "下载正式 DOCX",
    `/api/teacher/courses/${courseId}/quality-reports/${report.id}/download?artifact=docx`,
  );
}
