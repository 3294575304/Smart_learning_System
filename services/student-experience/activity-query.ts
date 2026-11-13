import { z } from "zod";
import { studentTaskScopeSchema } from "./task-scope";

export const activityViews = [
  "tasks",
  "exams",
  "assignments",
  "attendance",
  "surveys",
] as const;
export type ActivityView = (typeof activityViews)[number];
export const activityStatuses = [
  "ALL",
  "TODO",
  "UPCOMING",
  "SUBMITTED",
  "EXPIRED",
] as const;
export type ActivityStatus = (typeof activityStatuses)[number];
export const activityStatusLabels: Record<ActivityStatus, string> = {
  ALL: "全部状态",
  TODO: "待处理",
  UPCOMING: "待开放",
  SUBMITTED: "已完成",
  EXPIRED: "已结束",
};
export const activityStatusOptions: Record<
  ActivityView,
  readonly ActivityStatus[]
> = {
  tasks: ["ALL", "TODO", "UPCOMING"],
  exams: activityStatuses,
  assignments: ["ALL", "TODO", "SUBMITTED", "EXPIRED"],
  attendance: activityStatuses,
  surveys: activityStatuses,
};
export const activityKindLabels = {
  ALL: "全部类型",
  exam: "课程考试",
  assignment: "课程作业",
  attendance: "课堂签到",
  survey: "课程问卷",
};
const querySchema = studentTaskScopeSchema.extend({
  courseId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    studentTaskScopeSchema.shape.courseId,
  ),
  classroomId: z.preprocess(
    (value) => (value === "" ? undefined : value),
    studentTaskScopeSchema.shape.classroomId,
  ),
  status: z
    .enum([...activityStatuses, "PENDING", "IN_PROGRESS"])
    .default("ALL")
    .transform((value) =>
      value === "PENDING" || value === "IN_PROGRESS"
        ? ("TODO" as const)
        : value,
    ),
  kind: z
    .enum(["ALL", "exam", "assignment", "attendance", "survey"])
    .default("ALL"),
  focus: studentTaskScopeSchema.shape.classroomId,
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type ActivityQuery = z.output<typeof querySchema>;

export function activityQuerySchema(view: ActivityView) {
  return querySchema.superRefine((query, ctx) => {
    if (view !== "exams" && query.focus)
      ctx.addIssue({
        code: "custom",
        path: ["focus"],
        message: "仅考试列表支持定位考试。",
      });
    if (!activityStatusOptions[view].includes(query.status)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "此页面不支持所选状态。",
      });
    }
    if (view !== "tasks" && query.kind !== "ALL") {
      ctx.addIssue({
        code: "custom",
        path: ["kind"],
        message: "此页面不支持类型筛选。",
      });
    }
  });
}

export function activityHref(
  view: ActivityView,
  query: Partial<ActivityQuery>,
) {
  const params = new URLSearchParams();
  if (query.courseId) params.set("courseId", query.courseId);
  if (query.classroomId) params.set("classroomId", query.classroomId);
  if (query.status && query.status !== "ALL")
    params.set("status", query.status);
  if (query.kind && query.kind !== "ALL") params.set("kind", query.kind);
  if (query.focus) params.set("focus", query.focus);
  if (query.page && query.page !== 1) params.set("page", String(query.page));
  return `/student/${view}${params.size ? `?${params}` : ""}`;
}

export const activityPageSize = 8;

export function examListReturn(value: unknown, scope: Partial<ActivityQuery>) {
  const anchor = scope.focus ? `#exam-${scope.focus}` : "";
  const fallback = activityHref("exams", scope) + anchor;
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    (value !== "/student/exams" && !value.startsWith("/student/exams?"))
  )
    return fallback;
  const url = new URL(value, "http://localhost");
  if (url.pathname !== "/student/exams") return fallback;
  const query = activityQuerySchema("exams").safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (
    !query.success ||
    (query.data.courseId && query.data.courseId !== scope.courseId) ||
    (query.data.classroomId && query.data.classroomId !== scope.classroomId)
  )
    return fallback;
  const focus = scope.focus ?? query.data.focus;
  return (
    activityHref("exams", { ...query.data, focus }) +
    (focus ? `#exam-${focus}` : "")
  );
}

export function activityPage<T>(items: T[], requestedPage: number) {
  const pageSize = activityPageSize;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, Math.max(totalPages, 1));
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    pagination: { page, pageSize, total, totalPages },
  };
}
