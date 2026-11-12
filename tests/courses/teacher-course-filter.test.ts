import assert from "node:assert/strict";
import test from "node:test";
import { CourseStatus } from "@prisma/client";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  TeacherCourseList,
  filterTeacherCourses,
} from "../../components/courses/teacher-course-list";
import type { TeacherCourseListItem } from "../../services/courses/types";

function course(
  overrides: Partial<TeacherCourseListItem> & { id: string },
): TeacherCourseListItem {
  return {
    template: {
      id: "template-python",
      code: "python-programming-v1",
      name: "Python 程序设计",
      description: null,
      version: "1.0",
      isBuiltin: true,
    },
    questionCategoryId: "category-python",
    questionCategoryName: "Python 程序设计",
    courseNo: "PY-2026-01",
    term: "2026-2027-1",
    name: "Python 程序设计",
    description: "秋季学期主课程",
    status: CourseStatus.ACTIVE,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    archivedAt: null,
    classroomCount: 3,
    activeClassroomCount: 2,
    activeStudentCount: 97,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

const activePython = course({ id: "k1" });
const draftPython = course({
  id: "k2",
  courseNo: "PY-2027-02",
  term: "2026-2027-2",
  name: "Python 程序设计（进阶）",
  description: "春季学期选修",
  status: CourseStatus.DRAFT,
  publishedAt: null,
});
const archivedDs = course({
  id: "k3",
  courseNo: "DS-2025-01",
  term: "2025-2026-2",
  name: "数据结构",
  description: null,
  status: CourseStatus.ARCHIVED,
  archivedAt: new Date("2026-01-10T00:00:00.000Z"),
  questionCategoryName: "数据结构",
  template: {
    id: "template-ds",
    code: "data-structure-v1",
    name: "数据结构模板",
    description: null,
    version: "2.0",
    isBuiltin: false,
  },
  classroomCount: 1,
  activeClassroomCount: 0,
  activeStudentCount: 0,
});

const all = [activePython, draftPython, archivedDs];

test("没有条件时返回全部课程并保持原有顺序", () => {
  assert.deepEqual(
    filterTeacherCourses(all, { keyword: "", status: "", term: "" }).map(
      (item) => item.id,
    ),
    ["k1", "k2", "k3"],
  );
});

test("关键词覆盖课程名称、课程号、学期、分类与模板名", () => {
  const ids = (keyword: string) =>
    filterTeacherCourses(all, { keyword, status: "", term: "" }).map(
      (item) => item.id,
    );

  assert.deepEqual(ids("py-2026"), ["k1"]);
  assert.deepEqual(ids("2025-2026-2"), ["k3"]);
  assert.deepEqual(ids("数据结构模板"), ["k3"]);
  assert.deepEqual(ids("进阶"), ["k2"]);
  assert.deepEqual(ids("python"), ["k1", "k2"]);
});

test("多个关键词需要同时命中，允许分别命中不同字段", () => {
  assert.deepEqual(
    filterTeacherCourses(all, {
      keyword: "python py-2027",
      status: "",
      term: "",
    }).map((item) => item.id),
    ["k2"],
  );
  assert.deepEqual(
    filterTeacherCourses(all, {
      keyword: "python 数据结构",
      status: "",
      term: "",
    }),
    [],
  );
});

test("状态与学期可与关键词组合筛选", () => {
  assert.deepEqual(
    filterTeacherCourses(all, {
      keyword: "",
      status: CourseStatus.DRAFT,
      term: "",
    }).map((item) => item.id),
    ["k2"],
  );
  assert.deepEqual(
    filterTeacherCourses(all, {
      keyword: "",
      status: "",
      term: "2025-2026-2",
    }).map((item) => item.id),
    ["k3"],
  );
  assert.deepEqual(
    filterTeacherCourses(all, {
      keyword: "python",
      status: CourseStatus.ACTIVE,
      term: "2026-2027-1",
    }).map((item) => item.id),
    ["k1"],
  );
  // 关键词命中但学期不匹配时必须排除，验证条件之间是「与」关系
  assert.deepEqual(
    filterTeacherCourses(all, {
      keyword: "python",
      status: "",
      term: "2026-2027-2",
    }).map((item) => item.id),
    ["k2"],
  );
});

test("无匹配时返回空数组，由界面呈现空结果提示", () => {
  assert.deepEqual(
    filterTeacherCourses(all, {
      keyword: "无此课程",
      status: "",
      term: "",
    }),
    [],
  );
});

test("课程列表渲染搜索框、状态与学期筛选以及结果摘要", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherCourseList, { initialCourses: all }),
  );

  assert.match(markup, /搜索课程/u);
  assert.match(markup, /课程名称、课程号或学期/u);
  assert.match(markup, /课程状态/u);
  assert.match(markup, /全部状态/u);
  assert.match(markup, /学期/u);
  assert.match(markup, /全部学期/u);
  assert.match(markup, /重置筛选/u);
  assert.match(markup, /aria-live="polite"/u);
  assert.match(
    markup,
    /可搜索范围：课程名称、课程号、学期、课程说明、课程分类、课程模板名称、课程状态/u,
  );
  assert.match(markup, /共 3 门课程/u);
  assert.match(markup, /<option value="ACTIVE">启用<\/option>/u);
  assert.match(markup, /<option value="DRAFT">草稿<\/option>/u);
  assert.doesNotMatch(markup, /<option value="ARCHIVED">/u);
  // 学期选项来自真实数据
  assert.match(markup, /<option value="2026-2027-1">2026-2027-1<\/option>/u);
  assert.match(markup, /disabled=""/u);
});

test("只有启用课程时隐藏状态筛选，并忽略旧草稿筛选链接", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherCourseList, {
      initialCourses: [activePython],
      initialFilters: { keyword: "", status: CourseStatus.DRAFT, term: "" },
    }),
  );
  assert.doesNotMatch(markup, /全部状态/u);
  assert.match(markup, /全部学期/u);
  assert.match(markup, /共 1 门课程/u);
});

test("无课程时不显示筛选工具栏，仍保留创建引导", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherCourseList, { initialCourses: [] }),
  );

  assert.match(markup, /暂无课程/u);
  assert.doesNotMatch(markup, /搜索课程/u);
});

test("带筛选参数的链接直接渲染筛选后的结果，便于刷新与分享", () => {
  const byTerm = renderToStaticMarkup(
    React.createElement(TeacherCourseList, {
      initialCourses: all,
      initialFilters: { keyword: "", status: "", term: "2025-2026-2" },
    }),
  );

  assert.match(byTerm, /数据结构/u);
  assert.doesNotMatch(byTerm, /（进阶）/u);
  assert.match(byTerm, /筛选出 1 \/ 3 门/u);
  assert.match(byTerm, /当前条件：学期「2025-2026-2」/u);

  const byStatus = renderToStaticMarkup(
    React.createElement(TeacherCourseList, {
      initialCourses: all,
      initialFilters: {
        keyword: "",
        status: CourseStatus.DRAFT,
        term: "",
      },
    }),
  );

  assert.match(byStatus, /（进阶）/u);
  assert.doesNotMatch(byStatus, /数据结构/u);
});

test("链接里的失效学期与状态条件被忽略，不会出现空列表死局", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherCourseList, {
      initialCourses: all,
      initialFilters: {
        keyword: "",
        status: "HACKED",
        term: "1999-2000-1",
      },
    }),
  );

  assert.match(markup, /共 3 门课程/u);
});
