import Link from "next/link";
import { AutoSubmitSelect } from "@/components/filters/auto-submit-select";
import { PageIndex } from "./page-index";
import type { StudentClassroomOption } from "./student-classroom-filter";
import {
  activityHref,
  activityKindLabels,
  activityStatusLabels,
  activityStatusOptions,
  type ActivityQuery,
  type ActivityView,
} from "@/services/student-experience/activity-query";

export const activityCardClass =
  "min-w-0 rounded-xl border border-sky-100 bg-white p-4 sm:p-5";
export const activityActionClass =
  "inline-flex min-h-10 items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700";
const control =
  "min-h-10 w-full min-w-0 rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700";

export function StudentActivityFilters({
  view,
  query,
  classrooms,
  total,
}: {
  view: ActivityView;
  query: ActivityQuery;
  classrooms: StudentClassroomOption[];
  total: number;
}) {
  const fixed = Boolean(query.courseId && query.classroomId);
  const classroom = classrooms.find(
    (option) => option.id === query.classroomId,
  );
  return (
    <form
      action={`/student/${view}`}
      method="get"
      aria-label="列表筛选"
      className={activityCardClass}
    >
      {query.courseId && (
        <input type="hidden" name="courseId" value={query.courseId} />
      )}
      <div className="flex flex-wrap items-end gap-3">
        {fixed ? (
          <div aria-label="当前教学班" className="min-w-0 flex-1 text-sm">
            <input type="hidden" name="classroomId" value={query.classroomId} />
            <p className="font-medium text-slate-700">当前教学班</p>
            <p className="mt-1 break-words text-slate-600">
              {[classroom?.courseName, classroom?.name, classroom?.term]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ) : (
          <label className="min-w-0 flex-[2_1_14rem] space-y-1 text-sm font-medium text-slate-700">
            <span>教学班</span>
            <AutoSubmitSelect
              key={query.classroomId}
              name="classroomId"
              defaultValue={query.classroomId ?? ""}
              className={control}
            >
              <option value="">全部教学班</option>
              {classrooms.map((option) => (
                <option key={option.id} value={option.id}>
                  {[option.courseName, option.name, option.term]
                    .filter(Boolean)
                    .join(" · ")}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
        )}
        {view === "tasks" && (
          <label className="min-w-0 flex-[1_1_8rem] space-y-1 text-sm font-medium text-slate-700">
            <span>任务类型</span>
            <AutoSubmitSelect
              key={query.kind}
              name="kind"
              defaultValue={query.kind}
              className={control}
            >
              {Object.entries(activityKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
        )}
        <label className="min-w-0 flex-[1_1_8rem] space-y-1 text-sm font-medium text-slate-700">
          <span>状态</span>
          <AutoSubmitSelect
            key={query.status}
            name="status"
            defaultValue={query.status}
            className={control}
          >
            {activityStatusOptions[view].map((status) => (
              <option key={status} value={status}>
                {activityStatusLabels[status]}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <noscript>
          <button className={activityActionClass} type="submit">
            应用筛选
          </button>
        </noscript>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p role="status">共 {total} 项</p>
        {(query.status !== "ALL" ||
          query.kind !== "ALL" ||
          (query.classroomId && !fixed)) && (
          <Link
            className="rounded px-2 py-1 font-medium text-sky-800 hover:bg-sky-50 focus-visible:outline-2"
            href={activityHref(view, {
              courseId: query.courseId,
              classroomId: fixed ? query.classroomId : undefined,
            })}
          >
            重置筛选
          </Link>
        )}
      </div>
    </form>
  );
}

export function StudentActivityPagination({
  view,
  query,
  pagination,
}: {
  view: ActivityView;
  query: ActivityQuery;
  pagination: { page: number; totalPages: number };
}) {
  return (
    <PageIndex
      {...pagination}
      ariaLabel="列表分页"
      hrefForPage={(page) =>
        activityHref(view, { ...query, focus: undefined, page })
      }
      nativeNavigation
    />
  );
}
