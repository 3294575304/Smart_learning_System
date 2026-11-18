import { Role } from "@prisma/client";

import { requireAuthenticatedUser } from "@/services/auth/authorization";
import { getStudentClassroomContext } from "@/services/courses/student-access";
import { parseGrowthRange } from "@/services/courses/student-workspace";
import { courseIdSchema } from "@/services/courses/schemas";
import { getStudentCourseLearningCenter } from "@/services/learner-profiles/learning-center";

type Context = { params: Promise<{ courseId: string }> };

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * 导出当前区间内的掌握度与得分率趋势。
 * 只导出页面上已经展示的聚合点，不下发逐题/逐知识点明细。
 */
export async function GET(request: Request, context: Context) {
  const path = courseIdSchema.safeParse((await context.params).courseId);
  if (!path.success) return new Response("课程 ID 格式无效", { status: 400 });
  const url = new URL(request.url);
  const classroomId = url.searchParams.get("classroomId") ?? undefined;
  const range = parseGrowthRange(url.searchParams.get("range") ?? undefined);
  try {
    const student = await requireAuthenticatedUser([Role.STUDENT]);
    if (classroomId) {
      await getStudentClassroomContext(student.id, classroomId, path.data);
    }
    const data = await getStudentCourseLearningCenter(
      student.id,
      path.data,
      classroomId,
      "activity",
      { range },
    );
    const rows: string[][] = [
      ["类型", "日期", "数值", "说明"],
      ...data.masteryTrend.map((point) => [
        "课程稳定掌握度",
        point.label,
        String(point.value),
        point.detail,
      ]),
      ...data.accuracyTrend.map((point) => [
        "近期评分得分率",
        point.label,
        String(point.value),
        point.detail,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const filename = `知识与成长-${range}-${new Date().toISOString().slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new Response("导出失败，请稍后重试", { status: 400 });
  }
}
