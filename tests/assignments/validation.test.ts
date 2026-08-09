import assert from "node:assert/strict";
import test from "node:test";

import {
  assignmentListQuerySchema,
  assignmentUpsertSchema,
  autosaveAnswersSchema,
  manualGradeAnswerSchema,
  studentAssignmentListQuerySchema,
  studentResultsQuerySchema,
  teacherSubmissionListQuerySchema,
} from "../../services/assignments/schemas";

const classroomId = "cm12345678901234567890123";
const questionId = "cm22345678901234567890123";

function validAssignment() {
  return {
    title: "七年级数学作业",
    description: "完成后提交",
    classroomId,
    publishedAt: new Date("2026-07-15T08:00:00.000Z"),
    dueAt: new Date("2026-07-16T08:00:00.000Z"),
    allowResubmission: false,
    questions: [{ questionId, sortOrder: 1, points: 10 }],
  };
}

test("assignment validation accepts a complete draft", () => {
  assert.equal(
    assignmentUpsertSchema.safeParse(validAssignment()).success,
    true,
  );
});

test("assignment validation rejects duplicate questions and order values", () => {
  const input = validAssignment();
  input.questions.push({ questionId, sortOrder: 1, points: 5 });
  const parsed = assignmentUpsertSchema.safeParse(input);
  assert.equal(parsed.success, false);
  if (!parsed.success) assert.ok(parsed.error.issues.length >= 2);
});

test("assignment validation rejects a deadline before publish time", () => {
  const parsed = assignmentUpsertSchema.safeParse({
    ...validAssignment(),
    dueAt: new Date("2026-07-15T07:59:59.000Z"),
  });
  assert.equal(parsed.success, false);
});

test("autosave validation rejects duplicate selected options", () => {
  const parsed = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      {
        assignmentQuestionId: questionId,
        kind: "CHOICE",
        optionIds: [classroomId, classroomId],
      },
    ],
  });
  assert.equal(parsed.success, false);
});

test("autosave validates the optional per-question response time", () => {
  const valid = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      {
        assignmentQuestionId: questionId,
        kind: "BOOLEAN",
        value: true,
        responseTimeMs: 30_000,
      },
    ],
  });
  const invalid = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      {
        assignmentQuestionId: questionId,
        kind: "BOOLEAN",
        value: true,
        responseTimeMs: 86_400_001,
      },
    ],
  });
  assert.equal(valid.success, true);
  assert.equal(invalid.success, false);
});

test("autosave accepts an omitted or zero response time", () => {
  const omitted = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      { assignmentQuestionId: questionId, kind: "BOOLEAN", value: true },
    ],
  });
  const zero = autosaveAnswersSchema.safeParse({
    version: 0,
    answers: [
      {
        assignmentQuestionId: questionId,
        kind: "BOOLEAN",
        value: true,
        responseTimeMs: 0,
      },
    ],
  });
  assert.equal(omitted.success, true);
  assert.equal(zero.success, true);
});

test("autosave accepts bounded Python source code", () => {
  assert.equal(
    autosaveAnswersSchema.safeParse({
      version: 0,
      answers: [
        {
          assignmentQuestionId: questionId,
          kind: "CODE",
          value: "print('hello')",
        },
      ],
    }).success,
    true,
  );
  assert.equal(
    autosaveAnswersSchema.safeParse({
      version: 0,
      answers: [
        {
          assignmentQuestionId: questionId,
          kind: "CODE",
          value: "x".repeat(200_001),
        },
      ],
    }).success,
    false,
  );
});

test("autosave rejects negative, fractional, and over-limit response times", () => {
  for (const responseTimeMs of [-1, 1.5, 86_400_001]) {
    const parsed = autosaveAnswersSchema.safeParse({
      version: 0,
      answers: [
        {
          assignmentQuestionId: questionId,
          kind: "BOOLEAN",
          value: true,
          responseTimeMs,
        },
      ],
    });
    assert.equal(parsed.success, false);
  }
});

test("作业列表查询校验筛选、排序与分页参数", () => {
  const parsed = assignmentListQuerySchema.safeParse({
    keyword: "  单元测试  ",
    classroomId,
    sort: "DUE_ASC",
    page: "2",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.keyword, "单元测试");
    assert.equal(parsed.data.page, 2);
    assert.equal(parsed.data.sort, "DUE_ASC");
  }
  assert.equal(
    assignmentListQuerySchema.safeParse({ sort: "UNKNOWN" }).success,
    false,
  );
});

test("学生成绩列表查询限制分页范围", () => {
  assert.deepEqual(studentResultsQuerySchema.parse({}), {
    page: 1,
    pageSize: 10,
  });
  assert.equal(
    studentResultsQuerySchema.safeParse({ page: "2", pageSize: "30" }).success,
    true,
  );
  assert.equal(
    studentResultsQuerySchema.safeParse({ pageSize: 31 }).success,
    false,
  );
});

test("学生作业列表查询校验状态筛选", () => {
  assert.deepEqual(studentAssignmentListQuerySchema.parse({}), {
    page: 1,
    status: "ALL",
  });
  assert.equal(
    studentAssignmentListQuerySchema.safeParse({ status: "IN_PROGRESS" })
      .success,
    true,
  );
  assert.equal(
    studentAssignmentListQuerySchema.safeParse({ status: "UNKNOWN" }).success,
    false,
  );
});

test("人工评分只接受非负有限数字", () => {
  assert.equal(
    manualGradeAnswerSchema.safeParse({ score: 3.5, feedback: "继续努力" })
      .success,
    true,
  );
  for (const score of [-0.01, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.equal(
      manualGradeAnswerSchema.safeParse({ score, feedback: "" }).success,
      false,
    );
  }
});

test("教师提交列表只接受可批改和已发布状态", () => {
  assert.deepEqual(teacherSubmissionListQuerySchema.parse({}), {
    page: 1,
    pageSize: 20,
  });
  for (const status of ["PENDING_REVIEW", "GRADED", "PUBLISHED"]) {
    assert.equal(
      teacherSubmissionListQuerySchema.safeParse({ status }).success,
      true,
    );
  }
  assert.equal(
    teacherSubmissionListQuerySchema.safeParse({ status: "IN_PROGRESS" })
      .success,
    false,
  );
});
