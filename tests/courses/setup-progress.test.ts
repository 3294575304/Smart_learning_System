import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCourseSetupProgress,
  type CourseSetupInput,
} from "../../services/courses/setup-progress";

function course(overrides: Partial<CourseSetupInput> = {}): CourseSetupInput {
  return {
    courseId: "course-one",
    status: "ACTIVE",
    activeClassroomCount: 1,
    activeStudentCount: 30,
    syllabus: { id: "file-one", versionNumber: 1, parseStatus: "SUCCEEDED" },
    publishedSyllabus: {
      id: "syllabus-one",
      syllabusId: "file-one",
      versionNumber: 1,
      graphDraftStatus: "SUCCEEDED",
    },
    graph: {
      id: "graph-one",
      sourceSyllabusStructureId: "syllabus-one",
      versionNumber: 1,
    },
    assessment: {
      sourcePublishedSyllabusStructureId: "syllabus-one",
      versionNumber: 1,
    },
    ...overrides,
  };
}

function step(input: CourseSetupInput, id: string) {
  const result = buildCourseSetupProgress(input).steps.find(
    (item) => item.id === id,
  );
  assert.ok(result);
  return result;
}

test("课程建设只统计班级、大纲、图谱和考核方案四项", () => {
  const progress = buildCourseSetupProgress(course());
  assert.deepEqual(
    progress.steps.map((item) => item.id),
    ["classrooms", "syllabus", "graph", "assessment"],
  );
  assert.equal(progress.completedCount, 4);
  assert.equal(progress.totalCount, 4);
  assert.equal(progress.percentage, 100);
  assert.equal(progress.nextStep, null);
  assert.equal(progress.activeStudentCount, 30);
});

test("新课程从创建班级开始，大纲上传和发布只占一项", () => {
  const progress = buildCourseSetupProgress(
    course({
      activeClassroomCount: 0,
      activeStudentCount: 0,
      syllabus: null,
      publishedSyllabus: null,
      graph: null,
      assessment: null,
    }),
  );
  assert.equal(progress.completedCount, 0);
  assert.equal(progress.totalCount, 4);
  assert.equal(progress.nextStep?.id, "classrooms");
  assert.equal(progress.nextStep?.title, "创建课程班级");
  assert.equal(step(course({ syllabus: null }), "syllabus").state, "pending");
  assert.equal(step(course({ syllabus: null }), "syllabus").action, "上传大纲");
});

test("大纲草稿未发布前不算完成，解析任务与失败状态有恢复提示", () => {
  const draft = step(course({ publishedSyllabus: null }), "syllabus");
  assert.equal(draft.state, "pending");
  assert.match(draft.detail, /核对原文、保存修订并发布/u);
  for (const status of ["PENDING", "PROCESSING", "FAILED"] as const) {
    const result = step(
      course({
        publishedSyllabus: null,
        syllabus: { id: "file-one", versionNumber: 1, parseStatus: status },
      }),
      "syllabus",
    );
    assert.equal(
      result.state,
      status === "FAILED" ? "attention" : "processing",
    );
    assert.equal(result.href, "/teacher/courses/course-one/syllabus");
    if (status === "FAILED") assert.match(result.detail, /重新解析或更换文件/u);
    else assert.equal(result.action, "查看解析进度");
  }
});

test("新上传文件未发布时旧正式版继续生效，但大纲准备项待处理", () => {
  const input = course({
    syllabus: { id: "file-two", versionNumber: 2, parseStatus: "SUCCEEDED" },
  });
  assert.equal(step(input, "syllabus").state, "attention");
  assert.match(step(input, "syllabus").detail, /继续生效/u);
  assert.equal(step(input, "graph").state, "complete");
  assert.equal(buildCourseSetupProgress(input).completedCount, 3);
  assert.equal(buildCourseSetupProgress(input).nextStep?.id, "syllabus");
});

test("大纲更新后旧图谱与考核方案需核对，手工考核方案不误报", () => {
  const input = course({
    publishedSyllabus: {
      id: "syllabus-two",
      syllabusId: "file-one",
      versionNumber: 2,
      graphDraftStatus: null,
    },
  });
  assert.equal(step(input, "syllabus").state, "complete");
  assert.equal(step(input, "graph").state, "attention");
  assert.equal(step(input, "assessment").state, "attention");
  assert.equal(buildCourseSetupProgress(input).nextStep?.id, "graph");
  assert.equal(
    step(
      course({
        assessment: {
          sourcePublishedSyllabusStructureId: null,
          versionNumber: 2,
        },
      }),
      "assessment",
    ).state,
    "complete",
  );
});

test("图谱任务状态与课程归档仍按原规则显示", () => {
  for (const [status, state] of [
    ["FAILED", "attention"],
    ["PROCESSING", "processing"],
    ["PENDING", "processing"],
    ["SUCCEEDED", "pending"],
  ] as const) {
    const input = course({
      graph: null,
      publishedSyllabus: {
        id: "syllabus-one",
        syllabusId: "file-one",
        versionNumber: 1,
        graphDraftStatus: status,
      },
    });
    assert.equal(step(input, "graph").state, state);
  }
  const archived = buildCourseSetupProgress(
    course({ status: "ARCHIVED", graph: null }),
  );
  assert.equal(archived.archived, true);
  assert.equal(archived.nextStep, null);
});
