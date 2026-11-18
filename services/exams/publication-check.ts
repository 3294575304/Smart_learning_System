import { examCreateSchema, type ExamCreateInput } from "./schemas";

export interface ExamPublicationIssue {
  /** 与表单字段一一对应，前端用它把错误落到具体输入框。 */
  field:
    | "courseId"
    | "classroomIds"
    | "title"
    | "startsAt"
    | "endsAt"
    | "allowedSwitches"
    | "autoSubmitOnExit"
    | "allowedAttempts"
    | "questions"
    | "form";
  message: string;
}

const FIELD_MESSAGES: Record<string, string> = {
  courseId: "请选择课程。",
  classroomIds: "请选择 1 至 20 个不同的教学班。",
  title: "考试名称须为 2 至 120 个字符。",
  startsAt: "请填写有效的开考时间。",
  endsAt: "请填写有效的截止时间，且晚于开考时间。",
  allowedSwitches: "允许切屏次数须为 0 至 20 的整数。",
  autoSubmitOnExit: "请选择退出考试时的交卷规则。",
  allowedAttempts: "允许考试次数须为 1 至 20 的整数。",
  questions: "请选择 1 至 200 道不同的题目，每题分值须大于 0 且不超过 10000。",
};

/**
 * 收集**全部**发布前问题，而不是只返回第一条。
 *
 * 之前 checkExamPublication 只把 issues[0] 的文案交回页面，教师看到的是
 * 页面底部一句"请选择课程。"，但不知道是哪一项、也看不到其余错误。
 * 现在把规则集中在这里：前端逐字段标红，后端仍只取第一条（保持接口不变）。
 */
export function collectExamPublicationIssues(
  input: unknown,
  availableClassroomIds: readonly string[],
  now = new Date(),
): ExamPublicationIssue[] {
  const parsed = examCreateSchema.safeParse(input);
  if (!parsed.success) {
    const seen = new Set<string>();
    const issues: ExamPublicationIssue[] = [];
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        field: (key in FIELD_MESSAGES
          ? key
          : "form") as ExamPublicationIssue["field"],
        message: FIELD_MESSAGES[key] ?? issue.message,
      });
    }
    return issues;
  }

  const { classroomIds, questions, endsAt } = parsed.data;
  const issues: ExamPublicationIssue[] = [];
  if (classroomIds.some((id) => !availableClassroomIds.includes(id)))
    issues.push({
      field: "classroomIds",
      message: "所选班级已不可用，请重新选择。",
    });
  if (endsAt <= now)
    issues.push({ field: "endsAt", message: "考试截止时间须晚于当前时间。" });
  if (classroomIds.length * questions.length > 400)
    issues.push({
      field: "questions",
      message: `班级 ${classroomIds.length} 个 × 题目 ${questions.length} 道 = ${classroomIds.length * questions.length}，超过上限 400，请减少班级或题目。`,
    });
  return issues;
}

export function checkExamPublication(
  input: unknown,
  availableClassroomIds: readonly string[],
  now = new Date(),
): { data: ExamCreateInput; error?: never } | { error: string; data?: never } {
  const issues = collectExamPublicationIssues(
    input,
    availableClassroomIds,
    now,
  );
  if (issues.length) return { error: issues[0]!.message };
  return { data: examCreateSchema.parse(input) };
}
