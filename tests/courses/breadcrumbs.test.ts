import assert from "node:assert/strict";
import test from "node:test";

import { buildBreadcrumbs } from "../../components/dashboard/breadcrumbs";

const labels = {
  teacher: "教师工作台",
  courses: "课程管理",
  syllabus: "教学大纲",
};

test("课程功能页可通过课程管理详情面包屑返回课程详情", () => {
  const breadcrumbs = buildBreadcrumbs(
    "/teacher/courses/course-123/syllabus",
    labels,
  );

  assert.deepEqual(breadcrumbs, [
    { href: "/teacher", label: "教师工作台", linkable: true },
    { href: "/teacher/courses", label: "课程管理", linkable: true },
    {
      href: "/teacher/courses/course-123",
      label: "课程管理详情",
      linkable: true,
    },
    {
      href: "/teacher/courses/course-123/syllabus",
      label: "教学大纲",
      linkable: false,
    },
  ]);
});

test("课程详情本身仍是当前页且不可点击", () => {
  const breadcrumbs = buildBreadcrumbs("/teacher/courses/course-123", labels);

  assert.deepEqual(breadcrumbs.at(-1), {
    href: "/teacher/courses/course-123",
    label: "课程管理详情",
    linkable: false,
  });
});

test("非课程动态详情继续使用原有不可点击行为", () => {
  const breadcrumbs = buildBreadcrumbs(
    "/teacher/assignments/assignment-123/submissions",
    {
      teacher: "教师工作台",
      assignments: "作业管理",
      submissions: "提交记录",
    },
  );

  assert.deepEqual(breadcrumbs[2], {
    href: "/teacher/assignments/assignment-123",
    label: "详情",
    linkable: false,
  });
});
