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
    templateName: "Python 程序设计",
    activeClassroomCount: 1,
    activeStudentCount: 30,
    pendingIdentityCount: 0,
    latestImportStatus: "SUCCEEDED",
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
    teachingProgress: { graphVersionId: "graph-one", conceptCount: 5 },
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

test("基础准备完整时为 8/8，不依赖可选教学材料或课程发布开关", () => {
  const progress = buildCourseSetupProgress(course());
  assert.equal(progress.completedCount, 8);
  assert.equal(progress.totalCount, 8);
  assert.equal(progress.percentage, 100);
  assert.equal(progress.nextStep, null);
  assert.ok(
    progress.steps.every((item) =>
      item.href.startsWith("/teacher/courses/course-one"),
    ),
  );
});

test("新课程明确前置条件，启用状态不能冒充教学准备已完成", () => {
  const progress = buildCourseSetupProgress(
    course({
      activeClassroomCount: 0,
      activeStudentCount: 0,
      latestImportStatus: null,
      syllabus: null,
      publishedSyllabus: null,
      graph: null,
      assessment: null,
      teachingProgress: null,
    }),
  );
  assert.equal(progress.completedCount, 1);
  assert.equal(progress.nextStep?.id, "classrooms");
  assert.equal(
    progress.steps.find((item) => item.id === "syllabus-review")?.state,
    "blocked",
  );
  assert.equal(
    progress.steps.find((item) => item.id === "roster")?.state,
    "blocked",
  );
});

test("解析成功仍需教师审核发布，不能把草稿计为正式大纲", () => {
  assert.equal(
    step(course({ publishedSyllabus: null }), "syllabus-review").state,
    "pending",
  );
});

for (const status of ["PENDING", "PROCESSING", "FAILED"] as const) {
  test(`大纲 ${status} 提供对应进度或恢复入口`, () => {
    const result = step(
      course({
        publishedSyllabus: null,
        syllabus: { id: "file-one", versionNumber: 1, parseStatus: status },
      }),
      "syllabus-review",
    );
    assert.equal(
      result.state,
      status === "FAILED" ? "attention" : "processing",
    );
    assert.ok(result.href.endsWith("/syllabus"));
    if (status === "FAILED") assert.match(result.detail, /重新解析或更换文件/);
  });
}

test("替换文件未发布时提醒审核，同时保留旧正式图谱的有效状态", () => {
  const input = course({
    syllabus: { id: "file-two", versionNumber: 2, parseStatus: "SUCCEEDED" },
  });
  assert.equal(step(input, "syllabus-review").state, "attention");
  assert.match(step(input, "syllabus-review").detail, /继续生效/);
  assert.equal(step(input, "graph").state, "complete");
});

test("大纲发布新版本后，旧图谱和旧考核方案需要重新核对", () => {
  const input = course({
    publishedSyllabus: {
      id: "syllabus-two",
      syllabusId: "file-one",
      versionNumber: 2,
      graphDraftStatus: null,
    },
  });
  assert.equal(step(input, "graph").state, "attention");
  assert.equal(step(input, "assessment").state, "attention");
  assert.equal(buildCourseSetupProgress(input).nextStep?.id, "graph");
});

test("手工确认的考核方案不错误标记为来源版本过期", () => {
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

test("图谱生成失败有重试提示，排队与草稿完成不冒充正式发布", () => {
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
});

test("名单已导入但学生尚未认领时，名单准备完成并显示待认领人数", () => {
  const result = step(
    course({ activeStudentCount: 0, pendingIdentityCount: 30 }),
    "roster",
  );
  assert.equal(result.state, "complete");
  assert.match(result.detail, /已入班 0 人，待认领 30 人/);
});

test("历史成功不掩盖最新名单失败、处理中或待确认状态", () => {
  for (const [status, state] of [
    ["FAILED", "attention"],
    ["PARTIAL_FAILED", "attention"],
    ["PROCESSING", "processing"],
    ["CONFIRMED", "processing"],
    ["UPLOADED", "pending"],
    ["PREVIEW_READY", "pending"],
  ] as const) {
    assert.equal(
      step(course({ latestImportStatus: status }), "roster").state,
      state,
    );
  }
});

test("无学生的空名单不算完成，手动入班无需强制重新导入", () => {
  assert.equal(
    step(course({ activeStudentCount: 0, latestImportStatus: null }), "roster")
      .state,
    "pending",
  );
  assert.equal(
    step(course({ latestImportStatus: null }), "roster").state,
    "complete",
  );
});

test("教学进度空集不能开放练习，换图谱后需要重新确认进度", () => {
  assert.equal(
    step(
      course({
        teachingProgress: { graphVersionId: "graph-one", conceptCount: 0 },
      }),
      "teaching-progress",
    ).state,
    "pending",
  );
  assert.equal(
    step(
      course({
        teachingProgress: { graphVersionId: "graph-old", conceptCount: 5 },
      }),
      "teaching-progress",
    ).state,
    "attention",
  );
  assert.equal(
    step(course({ graph: null }), "teaching-progress").state,
    "blocked",
  );
});

test("课程归档后只展示记录，不建议继续开课", () => {
  const progress = buildCourseSetupProgress(
    course({ status: "ARCHIVED", graph: null }),
  );
  assert.equal(progress.archived, true);
  assert.equal(progress.nextStep, null);
});
