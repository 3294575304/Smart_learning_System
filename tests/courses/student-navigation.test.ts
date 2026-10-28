import assert from "node:assert/strict";
import test from "node:test";
import { readdir, access } from "node:fs/promises";
import path from "node:path";

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
    ["/student/results", "课程总评"],
    ["/student/attendance", "签到与出勤"],
    ["/student/surveys", "课程问卷"],
    ["/student/recommendations", "练习中心"],
    ["/student/wrong-questions", "复习中心"],
    ["/student/analytics", "学习分析"],
    ["/student/course-grades", "课程总评"],
  ];
  for (const [pathname, label] of cases) {
    assert.equal(getDashboardPageTitle(pathname, NAVIGATION.STUDENT), label);
    assert.equal(buildBreadcrumbs(pathname).at(-1)?.label, label);
  }
});

test("课程总评与成绩详情路径只选中课程总评，首页不会同时选中", () => {
  const items = NAVIGATION.STUDENT.flatMap((group) => group.items);
  for (const pathname of ["/student/results", "/student/course-grades"]) {
    assert.deepEqual(
      items
        .filter((item) => isNavigationItemActive(pathname, item))
        .map((item) => item.href),
      ["/student/course-grades"],
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
    "作业详情",
  );
  assert.equal(
    getDashboardPageTitle("/student/surveys/survey-123", NAVIGATION.STUDENT),
    "问卷详情",
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

test("课程练习和收藏详情保留练习中心选中，面包屑不指向不存在的根页", () => {
  const items = NAVIGATION.STUDENT.flatMap((group) => group.items);
  for (const path of [
    "/student/practice/cycle1",
    "/student/question-favorites/question1",
  ]) {
    assert.deepEqual(
      items
        .filter((item) => isNavigationItemActive(path, item))
        .map((item) => item.href),
      [
        path.includes("question-favorites")
          ? "/student/wrong-questions"
          : "/student/recommendations",
      ],
    );
    const crumbs = buildBreadcrumbs(path);
    assert.equal(
      crumbs[1].href,
      path.includes("question-favorites")
        ? "/student/wrong-questions?view=favorites"
        : "/student/recommendations",
    );
  }
  assert.equal(
    buildBreadcrumbs("/student/submissions/sub1/answer")[1].href,
    "/student/assignments",
  );
});

test("作答和提交结果统一选中学习任务入口", () => {
  const items = NAVIGATION.STUDENT.flatMap((group) => group.items);
  for (const [path, expected] of [
    ["/student/submissions/sub1/answer", "/student/tasks"],
    ["/student/submissions/sub1/result", "/student/tasks"],
  ]) {
    assert.deepEqual(
      items
        .filter((item) => isNavigationItemActive(path, item))
        .map((item) => item.href),
      [expected],
    );
  }
  assert.equal(
    buildBreadcrumbs("/student/submissions/sub1/result")[1].href,
    "/student/assignments?view=records",
  );
});

test("学生所有资源详情使用同一标题与面包屑命名，不暴露资源ID", () => {
  for (const [path, label] of [
    ["/student/assignments/a1", "作业详情"],
    ["/student/surveys/s1", "问卷详情"],
    ["/student/wrong-questions/w1", "错题详情"],
    ["/student/question-favorites/q1", "收藏题目详情"],
    ["/student/practice/cycle1", "练习记录"],
    ["/student/recommendations/r1", "练习详情"],
    ["/student/recommendations/r1/practice", "练习作答"],
    ["/student/submissions/s1/answer", "在线答题"],
    ["/student/submissions/s1/result", "提交结果"],
    ["/student/courses/c1/knowledge-graph", "知识图谱"],
    ["/student/courses/c1/profile", "我的课程画像"],
  ]) {
    assert.equal(getDashboardPageTitle(path, NAVIGATION.STUDENT), label);
    assert.equal(buildBreadcrumbs(path).at(-1)?.label, label);
    const active = NAVIGATION.STUDENT.flatMap((g) => g.items).filter((item) =>
      isNavigationItemActive(path, item),
    );
    assert.equal(active.length, 1);
  }
});

test("虚拟详情父级只保留可访问的模块，作答不陈列不存在的提交页", () => {
  assert.equal(buildBreadcrumbs("/student/practice/c1")[1].label, "练习中心");
  assert.equal(
    buildBreadcrumbs("/student/question-favorites/q1")[1].label,
    "复习中心",
  );
  const crumbs = buildBreadcrumbs("/student/submissions/s1/answer");
  assert.deepEqual(
    crumbs.map((c) => c.label),
    ["学习主页", "我的作业", "在线答题"],
  );
  assert.ok(!crumbs.some((c) => c.href === "/student/submissions/s1"));
});

test("学生全部已实现页面有一致标题、唯一选中导航，侧栏目标真实存在", async () => {
  const root = "app/(protected)/student";
  async function pages(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? pages(path.join(dir, entry.name))
          : Promise.resolve(
              entry.name === "page.tsx" ? [path.join(dir, entry.name)] : [],
            ),
      ),
    );
    return nested.flat();
  }
  const items = NAVIGATION.STUDENT.flatMap((g) => g.items);
  for (const file of await pages(root)) {
    const relative = path
      .relative(root, path.dirname(file))
      .replaceAll(path.sep, "/")
      .replace(/\[[^\]]+\]/g, "resource-123");
    const pathname = `/student${relative ? `/${relative}` : ""}`;
    const title = getDashboardPageTitle(pathname, NAVIGATION.STUDENT);
    assert.equal(buildBreadcrumbs(pathname).at(-1)?.label, title, pathname);
    assert.doesNotMatch(title, /resource-123|页面详情/);
    assert.equal(
      items.filter((item) => isNavigationItemActive(pathname, item)).length,
      1,
      pathname,
    );
  }
  for (const item of items)
    await access(`app/(protected)${item.href}/page.tsx`);
});
