import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { filterStudentGradeCards } from "../../services/gradebook/student-card-filters";
import { studentGradeFilterHref } from "../../services/gradebook/student-card-filters";
import { StudentCourseEvaluationCard } from "../../components/grades/student-course-evaluation-card";
import { StudentGradeFilters } from "../../components/grades/student-grade-filters";

const contexts = [
  {
    course: { id: "c1", name: "Python", term: "秋季", courseNo: "001" },
    classroom: { id: "a", name: "一班" },
  },
  {
    course: { id: "c1", name: "Python", term: "秋季", courseNo: "001" },
    classroom: { id: "b", name: "二班" },
  },
  {
    course: { id: "c2", name: "课程二", term: "春季", courseNo: "002" },
    classroom: { id: "c", name: "三班" },
  },
];
const published = new Set(["a", "c"]);
test("下拉跳转同时更新课程与状态，只保留已提交的搜索条件", () => {
  const url = new URL(
    studentGradeFilterHref(contexts, "b", "PENDING", "已应用关键词"),
    "http://localhost",
  );
  assert.equal(url.searchParams.get("courseId"), "c1");
  assert.equal(url.searchParams.get("classroomId"), "b");
  assert.equal(url.searchParams.get("publication"), "PENDING");
  assert.equal(url.searchParams.get("q"), "已应用关键词");
  const all = new URL(
    studentGradeFilterHref(contexts, "", "ALL", ""),
    "http://localhost",
  );
  assert.equal(all.searchParams.has("courseId"), false);
  assert.equal(all.searchParams.has("classroomId"), false);
  assert.throws(() => studentGradeFilterHref(contexts, "foreign", "ALL", ""));
});
test("学生总评只显示一个课程选择框，每个已加入班级独立成项", () => {
  const html = renderToStaticMarkup(
    React.createElement(StudentGradeFilters, {
      contexts,
      courseId: "c1",
      classroomId: "b",
      publication: "ALL",
      q: "",
    }),
  );
  assert.equal((html.match(/<select/g) ?? []).length, 2);
  assert.match(html, /name="classroomId"/);
  assert.doesNotMatch(html, /<select[^>]*name="courseId"/);
  assert.match(html, /Python · 一班 · 秋季/);
  assert.match(html, /Python · 二班 · 秋季/);
  assert.doesNotMatch(html, /全部教学班/);
});
test("课程、教学班、发布状态、关键词组合筛选且计数采用相同范围", () => {
  const result = filterStudentGradeCards(
    contexts,
    { courseId: "c1", classroomId: "b", publication: "PENDING", q: "PYTHON" },
    published,
  );
  assert.deepEqual(
    result.items.map((item) => item.classroom.id),
    ["b"],
  );
  assert.equal(result.total, 1);
  assert.equal(result.published, 0);
  assert.equal(result.pending, 1);
  assert.equal(
    filterStudentGradeCards(contexts, { classroomId: "a" }, published).items
      .length,
    1,
  );
  assert.equal(
    filterStudentGradeCards(contexts, { q: "002" }, published).items.length,
    1,
  );
  assert.equal(
    filterStudentGradeCards(contexts, { q: "不存在" }, published).items.length,
    0,
  );
  assert.equal(filterStudentGradeCards([], {}, new Set()).total, 0);
});

test("同名课程按加入的班级独立筛选，旧类型链接不擅自选班", () => {
  const ambiguous = filterStudentGradeCards(
    contexts,
    { courseId: "c1" },
    published,
  );
  assert.equal(ambiguous.selectionRequired, true);
  assert.deepEqual(ambiguous.items, []);
  const single = filterStudentGradeCards(
    contexts,
    { courseId: "c2" },
    published,
  );
  assert.equal(single.classroomId, "c");
  const inferred = filterStudentGradeCards(
    contexts,
    { classroomId: "a" },
    published,
  );
  assert.equal(inferred.courseId, "c1");
  assert.deepEqual(
    inferred.items.map((x) => x.classroom.id),
    ["a"],
  );
  assert.equal(
    filterStudentGradeCards(contexts, {}, published).items.length,
    3,
  );
});
test("非法、越权、跨课程和重复参数不扩大查询", () => {
  for (const raw of [
    { courseId: "foreign" },
    { classroomId: "foreign" },
    { courseId: "c1", classroomId: "c" },
    { publication: "invalid" },
    { courseId: ["c1", "c2"] },
    { q: "x".repeat(81) },
  ])
    assert.throws(() => filterStudentGradeCards(contexts, raw, published));
});
test("总评卡片区分零分、缺失、待发布及特殊状态，学情链接固定班级", () => {
  const props = {
    course: { ...contexts[0].course, status: "ACTIVE" },
    classrooms: [{ ...contexts[0].classroom, status: "ACTIVE" }],
    grades: [],
  };
  const pending = renderToStaticMarkup(
    React.createElement(StudentCourseEvaluationCard, props),
  );
  assert.match(pending, /待发布不代表零分/);
  assert.ok(pending.includes("courseId=c1&amp;classroomId=a"));
  assert.doesNotMatch(pending, /查看本班作业|课程自评/);
  for (const [score, status, expected] of [
    ["0.00", "SCORED", "0.00"],
    [null, "SCORED", "尚未录入"],
    [null, "ABSENT", "缺考"],
  ] as const) {
    const markup = renderToStaticMarkup(
      React.createElement(StudentCourseEvaluationCard, {
        ...props,
        grades: [
          {
            id: "g",
            classroomId: "a",
            score,
            status,
            publishedAt: "2026-10-01T00:00:00Z",
            version: 1,
            components: [],
            snapshot: {},
          },
        ],
      }),
    );
    assert.ok(markup.includes(expected));
    assert.match(markup, /成绩构成/);
  }
});
