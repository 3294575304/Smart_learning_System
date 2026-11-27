import { PageIndex } from "./page-index";
import {
  activityHref,
  withAssignmentTaskReturn,
  type ActivityQuery,
  type ActivityView,
} from "@/services/student-experience/activity-query";

export {
  activityActionClass,
  activityCardClass,
  activityControlClass,
  activityPrimaryClass,
} from "./student-activity-styles";
export { StudentActivityFilters } from "./student-activity-filters";

export function StudentActivityPagination({
  returnTo,
  view,
  query,
  pagination,
}: {
  returnTo?: string;
  view: ActivityView;
  query: ActivityQuery;
  pagination: { page: number; totalPages: number };
}) {
  return (
    <PageIndex
      {...pagination}
      ariaLabel="列表分页"
      hrefForPage={(page) =>
        withAssignmentTaskReturn(
          activityHref(view, { ...query, focus: undefined, page }),
          returnTo,
        )
      }
    />
  );
}
