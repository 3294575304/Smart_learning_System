import { notFound } from "next/navigation";
import { ResourceNotFoundError } from "@/services/auth/policy";
import { activityQuerySchema, type ActivityView } from "./activity-query";

export function readActivityPageQuery(
  view: ActivityView,
  raw: Record<string, string | string[] | undefined>,
) {
  const parsed = activityQuerySchema(view).safeParse(raw);
  if (!parsed.success) notFound();
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
