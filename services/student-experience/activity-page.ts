import { notFound } from "next/navigation";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { activityQuerySchema, type ActivityView } from "./activity-query";

export function readActivityPageQuery(
  view: ActivityView,
  raw: Record<string, string | string[] | undefined>,
  options: { lenient?: boolean } = {},
) {
  const parsed = activityQuerySchema(view).safeParse(raw);
  if (!parsed.success) {
    // 手改地址或过期书签不应把学生丢到 404：丢掉筛选参数回到默认视图。
    if (options.lenient) {
      const relaxed = activityQuerySchema(view).safeParse({
        analysisReturn: raw.analysisReturn,
        courseId: raw.courseId,
        classroomId: raw.classroomId,
      });
      if (relaxed.success) return relaxed.data;
    }
    notFound();
  }
  return parsed.data;
}

export async function readActivityPage<T>(load: () => Promise<T>) {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
}
