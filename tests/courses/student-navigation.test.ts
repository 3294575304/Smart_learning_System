import assert from "node:assert/strict";
import test from "node:test";

import { buildBreadcrumbs } from "../../components/dashboard/breadcrumbs";
import {
  getDashboardPageTitle,
  isNavigationItemActive,
  NAVIGATION,
} from "../../components/dashboard/navigation";

test("学生共享路径使用学生名称，顶部与面包屑保持一致", () => {
  const cases = [
    ["/student/assignments", "我的作业"],
    ["/student/tasks", "学习任务"],
    ["/student/results", "我的成绩"],
    ["/student/attendance", "签到与出勤"],
    ["/student/surveys", "课程问卷"],
    ["/student/recommendations", "练习中心"],
    ["/student/wrong-questions", "错题本"],
    ["/student/analytics", "学习分析"],
    ["/student/course-grades", "课程正式成绩"],
  ];
  for (const [pathname, label] of cases) {
    assert.equal(getDashboardPageTitle(pathname, NAVIGATION.STUDENT), label);
    assert.equal(buildBreadcrumbs(pathname).at(-1)?.label, label);
  }
});

test("课程总评与成绩详情路径只选中我的成绩，首页不会同时选中", () => {
  const items = NAVIGATION.STUDENT.flatMap((group) => group.items);
  for (const pathname of ["/student/results", "/student/course-grades"]) {
    assert.deepEqual(
      items
        .filter((item) => isNavigationItemActive(pathname, item))
        .map((item) => item.href),
      ["/student/results"],
    );
  }
  assert.equal(
    items.some((item) =>
      isNavigationItemActive("/student/results-other", item),
    ),
    false,
  );
});

test("学习任务入口在全局任务页及三个任务列表中保持选中", () => {
  const items = NAVIGATION.STUDENT.flatMap((group) => group.items);
  for (const pathname of [
    "/student/tasks",
    "/student/assignments",
    "/student/attendance",
    "/student/surveys",
  ]) {
    assert.deepEqual(
      items
        .filter((item) => isNavigationItemActive(pathname, item))
        .map((item) => item.href),
      ["/student/tasks"],
    );
  }
  assert.equal(
    getDashboardPageTitle(
      "/student/assignments/assignment-123",
      NAVIGATION.STUDENT,
    ),
    "我的作业",
  );
  assert.equal(
    getDashboardPageTitle("/student/surveys/survey-123", NAVIGATION.STUDENT),
    "课程问卷",
  );
});

test("课程内页保留我的课程上下文且不产生不存在的课程详情链接", () => {
  const path = "/student/courses/course-123/learning-center";
  const breadcrumbs = buildBreadcrumbs(path);
  assert.deepEqual(breadcrumbs[1], {
    href: "/student/courses",
    label: "我的课程",
    linkable: true,
  });
  assert.equal(breadcrumbs[2].linkable, false);
  assert.equal(breadcrumbs.at(-1)?.label, "课程学习中心");
  assert.equal(getDashboardPageTitle(path, NAVIGATION.STUDENT), "课程学习中心");
  const selected = NAVIGATION.STUDENT.flatMap((group) => group.items).filter(
    (item) => isNavigationItemActive(path, item),
  );
  assert.deepEqual(
    selected.map((item) => item.href),
    ["/student/courses"],
  );
});

test("学生命名不会影响教师同名路径或管理员导航", () => {
  for (const [pathname, label] of [
    ["/teacher/assignments", "作业管理"],
    ["/teacher/results", "成绩统计"],
    ["/teacher/courses/course-123/attendance", "出勤台账"],
    ["/teacher/courses/course-123/analytics", "学情分析"],
  ]) {
    assert.equal(getDashboardPageTitle(pathname, NAVIGATION.TEACHER), label);
    assert.equal(buildBreadcrumbs(pathname).at(-1)?.label, label);
  }
  assert.equal(
    getDashboardPageTitle("/admin/course-templates", NAVIGATION.ADMIN),
    "课程模板",
  );
  assert.equal(NAVIGATION.TEACHER.length, 1);
  assert.equal(NAVIGATION.ADMIN.length, 1);
});
