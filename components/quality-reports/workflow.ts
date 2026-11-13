export const REPORT_WORKFLOW_STEPS = [
  {
    id: "quality-report-create",
    title: "准备数据",
    description: "选择模板、成绩来源与教学信息",
  },
  {
    id: "quality-report-review",
    title: "生成与核对",
    description: "查看任务进度，逐项核实分析文字",
  },
  {
    id: "quality-report-download",
    title: "下载",
    description: "教师确认后获取正式文件",
  },
] as const;

export function reportWorkflowStage(
  report?: { status: string; reviewStatus: string } | null,
): number {
  if (!report || report.status === "FAILED") return 0;
  if (report.status === "SUCCEEDED" && report.reviewStatus === "APPROVED")
    return 2;
  return 1;
}
