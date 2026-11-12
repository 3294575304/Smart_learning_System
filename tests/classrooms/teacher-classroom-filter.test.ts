import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  TeacherClassroomList,
  filterTeacherClassrooms,
} from "../../components/classrooms/teacher-classroom-list";
import type { TeacherClassroomListItem } from "../../services/classrooms/service";

function classroom(
  overrides: Partial<TeacherClassroomListItem> & { id: string },
): TeacherClassroomListItem {
  return {
    name: "Python 程序设计1班",
    description: null,
    joinCode: "AAAA1111",
    status: "ACTIVE",
    allowStudentLeave: true,
    studentCount: 3,
    course: { id: "course-python", name: "Python 程序设计" },
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

const pythonActive = classroom({ id: "c1" });
const pythonCompleted = classroom({
  id: "c2",
  name: "python 2班",
  description: "课程演示班",
  joinCode: "SBFYF1LC",
  status: "COMPLETED",
  studentCount: 1,
});
const dataStructure = classroom({
  id: "c3",
  name: "数据结构演示班",
  description: "跨课程演示班级",
  joinCode: "GT4WEXLT",
  course: { id: "course-ds", name: "数据结构" },
});

const all = [pythonActive, pythonCompleted, dataStructure];

test("没有条件时返回全部班级并保持原有顺序", () => {
  assert.deepEqual(
    filterTeacherClassrooms(all, { keyword: "", status: "", courseId: "" }).map(
      (item) => item.id,
    ),
    ["c1", "c2", "c3"],
  );
});

test("关键词覆盖班级名称、说明、邀请码与关联课程名", () => {
  const ids = (keyword: string) =>
    filterTeacherClassrooms(all, { keyword, status: "", courseId: "" }).map(
      (item) => item.id,
    );

  assert.deepEqual(ids("数据结构"), ["c3"]);
  assert.deepEqual(ids("SBFYF1LC"), ["c2"]);
  assert.deepEqual(ids("跨课程演示"), ["c3"]);
  assert.deepEqual(ids("python"), ["c1", "c2"]);
});

test("多个关键词需要同时命中，空格分词后仍可跨字段组合", () => {
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "python 演示",
      status: "",
      courseId: "",
    }).map((item) => item.id),
    ["c2"],
  );
  // 状态文案也参与搜索："结课"命中 c2 的"已结课"
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "python 结课",
      status: "",
      courseId: "",
    }).map((item) => item.id),
    ["c2"],
  );
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "python 不存在的词",
      status: "",
      courseId: "",
    }),
    [],
  );
});

test("状态与关联课程可与关键词组合筛选", () => {
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "",
      status: "COMPLETED",
      courseId: "",
    }).map((item) => item.id),
    ["c2"],
  );
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "",
      status: "",
      courseId: "course-ds",
    }).map((item) => item.id),
    ["c3"],
  );
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "演示",
      status: "ACTIVE",
      courseId: "course-ds",
    }).map((item) => item.id),
    ["c3"],
  );
  // 关键词命中但状态不满足时必须被排除，验证条件之间是「与」关系
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "演示",
      status: "COMPLETED",
      courseId: "",
    }).map((item) => item.id),
    ["c2"],
  );
});

test("无匹配时返回空数组，由界面呈现空结果提示", () => {
  assert.deepEqual(
    filterTeacherClassrooms(all, {
      keyword: "不存在的班级",
      status: "",
      courseId: "",
    }),
    [],
  );
});

test("班级列表渲染搜索框、状态与关联课程筛选以及结果摘要", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherClassroomList, {
      initialClassrooms: all,
    }),
  );

  assert.match(markup, /搜索班级/u);
  assert.match(markup, /班级名称、邀请码或关联课程/u);
  assert.match(markup, /班级状态/u);
  assert.match(markup, /全部状态/u);
  assert.match(markup, /关联课程/u);
  assert.match(markup, /全部课程/u);
  assert.match(markup, /重置筛选/u);
  assert.match(markup, /aria-live="polite"/u);
  assert.match(
    markup,
    /可搜索范围：班级名称、班级说明、邀请码、关联课程名称、班级状态/u,
  );
  assert.match(markup, /共 3 个班级/u);
  // 状态选项来自真实数据，归档班级不在列表中时不出现该选项
  assert.match(markup, /<option value="ACTIVE">授课中<\/option>/u);
  assert.match(markup, /<option value="COMPLETED">已结课<\/option>/u);
  assert.doesNotMatch(markup, /<option value="ARCHIVED">/u);
  // 重置按钮在未筛选时是禁用态
  assert.match(markup, /disabled=""/u);
});

test("无班级时不显示筛选工具栏，仍保留创建引导", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherClassroomList, { initialClassrooms: [] }),
  );

  assert.match(markup, /暂无班级/u);
  assert.doesNotMatch(markup, /搜索班级/u);
});

test("带筛选参数的链接直接渲染筛选后的结果，便于刷新与分享", () => {
  const byStatus = renderToStaticMarkup(
    React.createElement(TeacherClassroomList, {
      initialClassrooms: all,
      initialFilters: { keyword: "", status: "COMPLETED", courseId: "" },
    }),
  );

  assert.match(byStatus, /python 2班/u);
  assert.doesNotMatch(byStatus, /数据结构演示班/u);
  assert.match(byStatus, /筛选出 1 \/ 3 个/u);
  assert.match(byStatus, /当前条件：状态「已结课」/u);

  const byKeyword = renderToStaticMarkup(
    React.createElement(TeacherClassroomList, {
      initialClassrooms: all,
      initialFilters: { keyword: "PYTHON", status: "", courseId: "" },
    }),
  );

  assert.match(byKeyword, /Python 程序设计1班/u);
  assert.match(byKeyword, /python 2班/u);
  assert.doesNotMatch(byKeyword, /数据结构演示班/u);
});

test("链接里的失效课程条件被忽略，不会出现空列表死局", () => {
  const markup = renderToStaticMarkup(
    React.createElement(TeacherClassroomList, {
      initialClassrooms: all,
      initialFilters: {
        keyword: "",
        status: "",
        courseId: "course-removed-long-ago",
      },
    }),
  );

  assert.match(markup, /共 3 个班级/u);
  assert.doesNotMatch(markup, /已失效/u);
});
