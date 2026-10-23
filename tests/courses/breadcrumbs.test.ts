import assert from "node:assert/strict";
import test from "node:test";

import { buildBreadcrumbs } from "../../components/dashboard/breadcrumbs";

const labels = {
  teacher: "教师工作台",
  courses: "课程管理",
  syllabus: "教学大纲",
};

test("新建与导入页面保留自己的名称，不被当作资源详情", () => {
  for (const pathname of [
    "/teacher/questions/new",
    "/teacher/assignments/new",
    "/teacher/courses/new",
    "/teacher/questions/import",
  ]) {
    const leaf = buildBreadcrumbs(pathname).at(-1);
    assert.equal(leaf?.label, pathname.endsWith("/new") ? "新建" : "导入");
    assert.equal(leaf?.linkable, false);
  }
});

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

test("作业提交页可通过动态面包屑返回真实作业详情", () => {
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
    label: "作业详情",
    linkable: true,
  });
});

test("课程各功能页的所有上级面包屑指向真实管理入口", () => {
  for (const section of [
    "teaching-progress",
    "question-mapping",
    "gradebook",
    "attendance",
    "knowledge-graph",
    "students",
    "profiles",
    "quality-report",
    "surveys",
    "assessment-scheme",
  ]) {
    const crumbs = buildBreadcrumbs(`/teacher/courses/course-123/${section}`);
    assert.deepEqual(
      crumbs.slice(0, 3).map((crumb) => [crumb.href, crumb.linkable]),
      [
        ["/teacher", true],
        ["/teacher/courses", true],
        ["/teacher/courses/course-123", true],
      ],
    );
    assert.equal(crumbs.at(-1)?.linkable, false);
  }
});
test("学生课程画像通过课程学习中心返回，不生成不存在的课程根页", () => {
  const crumbs = buildBreadcrumbs("/student/courses/course-123/profile");
  assert.equal(crumbs[2]?.href, "/student/courses/course-123/learning-center");
  assert.equal(crumbs[2]?.linkable, true);
});

test("课程学习中心路径只显示主页、我的课程和当前页，链接不能重复", () => {
  const crumbs = buildBreadcrumbs(
    "/student/courses/course-123/learning-center",
  );
  assert.deepEqual(crumbs, [
    { href: "/student", label: "学习主页", linkable: true },
    { href: "/student/courses", label: "我的课程", linkable: true },
    {
      href: "/student/courses/course-123/learning-center",
      label: "课程学习中心",
      linkable: false,
    },
  ]);
  assert.equal(new Set(crumbs.map((item) => item.href)).size, crumbs.length);
});
