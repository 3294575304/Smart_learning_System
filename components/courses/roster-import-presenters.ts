import {
  StudentImportBatchStatus,
  StudentImportPreviewStatus,
} from "@prisma/client";

import type {
  StudentImportExecutionAction,
  StudentImportExecutionSummary,
  StudentImportSummary,
} from "@/services/student-imports/types";

export const ROSTER_IMPORT_STEPS = [
  { number: 1, label: "上传文件", description: "选择班级与名单版本" },
  { number: 2, label: "字段映射", description: "核对自动识别结果" },
  { number: 3, label: "数据预览", description: "检查错误与导入范围" },
  { number: 4, label: "确认导入", description: "查看结果并下载账号表" },
] as const;

export const PREVIEW_STATUS_LABELS: Record<StudentImportPreviewStatus, string> =
  {
    PENDING: "待处理",
    NEW_USER: "将新建账号",
    EXISTING_USER: "已有账号，将加入班级",
    ALREADY_ENROLLED: "已在班级",
    COURSE_MISMATCH: "课程或学期不匹配",
    INVALID: "数据错误",
    DUPLICATE: "文件内重复",
  };

export const PREVIEW_STATUS_STYLES: Record<StudentImportPreviewStatus, string> =
  {
    PENDING: "bg-gray-100 text-gray-700",
    NEW_USER: "bg-blue-50 text-blue-700",
    EXISTING_USER: "bg-emerald-50 text-emerald-700",
    ALREADY_ENROLLED: "bg-slate-100 text-slate-700",
    COURSE_MISMATCH: "bg-amber-50 text-amber-800",
    INVALID: "bg-red-50 text-red-700",
    DUPLICATE: "bg-orange-50 text-orange-800",
  };

export const EXECUTION_ACTION_LABELS: Record<
  StudentImportExecutionAction,
  string
> = {
  CREATED_IDENTITY: "已创建待认领身份并预分配班级",
  MATCHED_EXISTING_USER: "已有账号已入班",
  ALREADY_ENROLLED: "原本已在班级",
  SKIPPED: "已跳过",
  FAILED: "导入失败",
};

export const BATCH_STATUS_LABELS: Record<StudentImportBatchStatus, string> = {
  UPLOADED: "文件已上传",
  PREVIEW_READY: "预览待处理",
  CONFIRMED: "映射已确认",
  PROCESSING: "正在导入",
  SUCCEEDED: "导入成功",
  PARTIAL_FAILED: "部分失败",
  FAILED: "导入失败",
  CANCELLED: "已取消",
};

export function previewBlockingReason(
  summary: StudentImportSummary,
): string | null {
  if (summary.canImport) return null;
  if (summary.errorRows > 0 || summary.errorCount > 0) {
    return `存在 ${summary.errorRows} 条错误记录、${summary.errorCount} 个阻断问题。请修正源文件或字段映射后重新预览。`;
  }
  return "当前预览未通过导入校验，请检查批次问题后重新预览。";
}

export function executionSummaryItems(summary: StudentImportExecutionSummary) {
  return [
    { label: "新增待认领身份", value: summary.createdUserRows },
    { label: "已有账号入班", value: summary.matchedExistingUserRows },
    { label: "原本已在班级", value: summary.alreadyEnrolledRows },
    { label: "跳过", value: summary.skippedRows },
    { label: "失败", value: summary.failedRows },
  ] as const;
}
