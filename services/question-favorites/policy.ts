import type { QuestionType } from "@prisma/client";
export interface FavoriteAvailabilityInput {
  status: string;
  deletedAt: Date | null;
  type: QuestionType;
  explanation: string;
  hasPermission: boolean;
  courseReady: boolean;
  hasCourseBinding: boolean;
  hasProgrammingConfig: boolean;
}
export function favoriteUnavailableReason(
  input: FavoriteAvailabilityInput,
): string | null {
  if (!input.hasPermission) return "当前已无课程或题目访问权限";
  if (input.status !== "ACTIVE" || input.deletedAt) return "题目已停用或下架";
  if (
    ![
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE",
      "TRUE_FALSE",
      "FILL_BLANK",
      "PYTHON_PROGRAMMING",
    ].includes(input.type)
  )
    return "此题型暂不支持自主练习";
  if (!input.explanation.trim()) return "题目解析尚未完善";
  if (!input.courseReady) return "当前课程正式知识图谱尚未就绪";
  if (!input.hasCourseBinding) return "此题目尚未关联当前课程正式知识点";
  if (input.type === "PYTHON_PROGRAMMING" && !input.hasProgrammingConfig)
    return "编程题判题配置尚未就绪";
  return null;
}
