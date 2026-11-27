import { readStudentAnalysisReturn } from "./analysis-navigation";
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
  "AWAITING",
  "CLOSED",
  "SPECIAL",
] as const;
export type ActivityStatus = (typeof activityStatuses)[number];
export const activityStatusLabels: Record<ActivityStatus, string> = {
  ALL: "全部状态",
  TODO: "待处理",
  UPCOMING: "待开放",
  SUBMITTED: "已完成",
  EXPIRED: "已结束",
  AWAITING: "等待结果",
  CLOSED: "已截止",
  SPECIAL: "已登记",
};
/**
 * 考试列表的状态词与其他列表不同：
 * - TODO 同时包含「进行中」和「已交卷但还能重考」；
 * - SUBMITTED 只表示「已出分」，不再泛指已交卷。
 */
export const examStatusFilterLabels: Record<ActivityStatus, string> = {
  ...activityStatusLabels,
  ALL: "全部状态",
  TODO: "进行中 / 可重考",
  UPCOMING: "待开考",
  AWAITING: "已交卷待出分",
  SUBMITTED: "已出分",
  CLOSED: "已截止",
  EXPIRED: "已截止",
  SPECIAL: "已登记成绩状态",
};
export function activityStatusLabelFor(
  view: ActivityView,
  status: ActivityStatus,
) {
  return view === "exams"
    ? examStatusFilterLabels[status]
    : activityStatusLabels[status];
}
export const activityStatusOptions: Record<
  ActivityView,
  readonly ActivityStatus[]
> = {
  tasks: ["ALL", "TODO", "UPCOMING"],
  exams: [
    "ALL",
    "TODO",
    "UPCOMING",
    "AWAITING",
    "SUBMITTED",
    "CLOSED",
    "SPECIAL",
  ],
  assignments: ["ALL", "TODO", "SUBMITTED", "EXPIRED"],
  attendance: ["ALL", "TODO", "UPCOMING", "SUBMITTED", "EXPIRED"],
  surveys: ["ALL", "TODO", "UPCOMING", "SUBMITTED", "EXPIRED"],
};
export const activityKindLabels = {
  ALL: "全部类型",
  exam: "课程考试",
  assignment: "课程作业",
  attendance: "课堂签到",
  survey: "课程问卷",
};
const querySchema = studentTaskScopeSchema.extend({
  analysisReturn: z.unknown().optional().transform(readStudentAnalysisReturn),
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
  /** 考试类型筛选，仅考试列表使用。 */
  examType: z.enum(["ALL", "MIDTERM", "FINAL", "REGULAR"]).default("ALL"),
  /** 标题关键词，仅考试列表使用。 */
  q: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => (value ? value : undefined)),
  /** 时间范围：term = 仅本学期，all = 全部（默认，避免误以为记录丢失）。 */
  range: z.enum(["all", "term"]).default("all"),
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
    if (view !== "exams" && query.examType !== "ALL") {
      ctx.addIssue({
        code: "custom",
        path: ["examType"],
        message: "仅考试列表支持考试类型筛选。",
      });
    }
    if (view !== "exams" && query.q) {
      ctx.addIssue({
        code: "custom",
        path: ["q"],
        message: "仅考试列表支持关键词搜索。",
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
  if (query.examType && query.examType !== "ALL")
    params.set("examType", query.examType);
  if (query.q) params.set("q", query.q);
  if (query.range && query.range !== "all") params.set("range", query.range);
  if (query.focus) params.set("focus", query.focus);
  if (query.analysisReturn) params.set("analysisReturn", query.analysisReturn);
  if (query.page && query.page !== 1) params.set("page", String(query.page));
  return `/student/${view}${params.size ? `?${params}` : ""}`;
}

export function assignmentTaskReturn(
  value: unknown,
  scope: Pick<ActivityQuery, "courseId" | "classroomId">,
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 1000 ||
    (value !== "/student/tasks" && !value.startsWith("/student/tasks?"))
  )
    return;

  const url = new URL(value, "http://localhost");
  if (url.hash) return;
  const entries = [...url.searchParams];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) return;

  const query = activityQuerySchema("tasks").safeParse(
    Object.fromEntries(entries),
  );
  if (
    !query.success ||
    (query.data.courseId && query.data.courseId !== scope.courseId) ||
    (query.data.classroomId && query.data.classroomId !== scope.classroomId)
  )
    return;
  return activityHref("tasks", query.data);
}

export function withAssignmentTaskReturn(href: string, returnTo?: string) {
  if (!returnTo) return href;
  const [pathname, search] = href.split("?");
  const params = new URLSearchParams(search);
  params.set("returnTo", returnTo);
  return `${pathname}?${params}`;
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
