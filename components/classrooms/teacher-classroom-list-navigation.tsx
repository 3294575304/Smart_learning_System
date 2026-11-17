import Link from "next/link";
import React from "react";

import {
  teacherClassroomListHref,
  type TeacherClassroomFilters,
} from "@/lib/teacher-classroom-list-route";

export function TeacherClassroomListNavigation({
  filters,
  history = false,
}: {
  filters: TeacherClassroomFilters;
  history?: boolean;
}) {
  return (
    <nav aria-label="班级视图" className="tt-tabs">
      <Link
        aria-current={history ? undefined : "page"}
        className="tt-tab"
        href={teacherClassroomListHref(filters)}
      >
        班级列表
      </Link>
      <Link
        aria-current={history ? "page" : undefined}
        className="tt-tab"
        href={teacherClassroomListHref(filters, true)}
      >
        历史班级
      </Link>
    </nav>
  );
}
