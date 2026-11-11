import { examCreateSchema, type ExamCreateInput } from "./schemas";

export function checkExamPublication(
  input: unknown,
  availableClassroomIds: readonly string[],
  now = new Date(),
): { data: ExamCreateInput; error?: never } | { error: string; data?: never } {
  const parsed = examCreateSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    const messages: Record<string, string> = {
      courseId: "请选择课程。",
      classroomIds: "请选择 1 至 20 个不同的教学班。",
      title: "考试名称须为 2 至 120 个字符。",
      startsAt: "请填写有效的开考时间。",
      endsAt: "请填写有效的截止时间，且晚于开考时间。",
      allowedSwitches: "允许切屏次数须为 0 至 20 的整数。",
      questions:
        "请选择 1 至 200 道不同的题目，每题分值须大于 0 且不超过 10000。",
    };
    return { error: messages[String(field)] ?? "请检查考试设置后重试。" };
  }
  const { classroomIds, questions, endsAt } = parsed.data;
  if (classroomIds.some((id) => !availableClassroomIds.includes(id)))
    return { error: "所选班级已不可用，请重新选择。" };
  if (endsAt <= now) return { error: "考试截止时间须晚于当前时间。" };
  if (classroomIds.length * questions.length > 400)
    return { error: "班级数乘以题数最多为 400，请减少班级或题目。" };
  return { data: parsed.data };
}
