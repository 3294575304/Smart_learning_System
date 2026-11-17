import assert from "node:assert/strict";
import test from "node:test";
import {
  examQuestionHash,
  overlapsThreeYears,
  plusThreeYears,
} from "../../services/exams/fingerprint";
import { examCreateSchema } from "../../services/exams/schemas";
import {
  checkExamPublication,
  collectExamPublicationIssues,
} from "../../services/exams/publication-check";
import { examAttendanceState } from "../../services/exams/monitor-state";

test("the same question unlocks on its three-year anniversary", () => {
  const first = new Date("2026-11-07T01:00:00.000Z");
  assert.equal(
    overlapsThreeYears(first, new Date("2029-11-07T00:59:59.999Z")),
    true,
  );
  assert.equal(overlapsThreeYears(first, plusThreeYears(first)), false);
});

test("exam monitor distinguishes no attempt, collection and automatic submission", () => {
  const window = {
    started: true,
    ended: false,
    classroomActive: true,
    cancelled: false,
  };
  assert.equal(
    examAttendanceState({ ...window, started: false }),
    "NOT_STARTED",
  );
  assert.equal(examAttendanceState(window), "NOT_ENTERED");
  assert.equal(examAttendanceState({ ...window, ended: true }), "ABSENT");
  assert.equal(
    examAttendanceState({
      ...window,
      submission: { status: "IN_PROGRESS", reason: null },
    }),
    "IN_PROGRESS",
  );
  assert.equal(
    examAttendanceState({
      ...window,
      ended: true,
      submission: { status: "IN_PROGRESS", reason: null },
    }),
    "COLLECTING",
  );
  assert.equal(
    examAttendanceState({
      ...window,
      submission: { status: "GRADED", reason: "SWITCH_LIMIT" },
    }),
    "AUTO_SUBMITTED",
  );
  assert.equal(
    examAttendanceState({
      ...window,
      submission: { status: "GRADED", reason: "MANUAL" },
    }),
    "SUBMITTED",
  );
});

test("question hash ignores whitespace but includes answer content", () => {
  const question = {
    type: "SINGLE_CHOICE",
    content: "  Python  输出  ",
    options: [
      { content: "A", isCorrect: true, sortOrder: 1 },
      { content: "B", isCorrect: false, sortOrder: 2 },
    ],
    correctBoolean: null,
    referenceAnswer: null,
    acceptableAnswers: [],
  };
  const changedWhitespace = { ...question, content: "Python 输出" };
  const changedAnswer = {
    ...question,
    options: question.options.map((item) => ({
      ...item,
      isCorrect: !item.isCorrect,
    })),
  };
  assert.equal(examQuestionHash(question), examQuestionHash(changedWhitespace));
  assert.notEqual(examQuestionHash(question), examQuestionHash(changedAnswer));
  const image = { checksum: "a".repeat(64), sortOrder: 1 };
  assert.notEqual(
    examQuestionHash(question),
    examQuestionHash({ ...question, examImages: [image] }),
  );
  assert.notEqual(
    examQuestionHash({ ...question, examImages: [image] }),
    examQuestionHash({
      ...question,
      examImages: [{ ...image, checksum: "b".repeat(64) }],
    }),
  );
});

test("exam requires an ordered nonempty paper and a valid window", () => {
  const input = {
    requestId: crypto.randomUUID(),
    courseId: "clh0000000000000000000000",
    classroomIds: ["clh0000000000000000000001"],
    type: "MIDTERM",
    title: "期中考试",
    startsAt: "2026-12-01T00:00:00Z",
    endsAt: "2026-12-01T01:00:00Z",
    allowedSwitches: 2,
    questions: [{ questionId: "clh0000000000000000000002", points: 10 }],
  };
  assert.equal(examCreateSchema.safeParse(input).success, true);
  assert.equal(
    examCreateSchema.safeParse({ ...input, endsAt: input.startsAt }).success,
    false,
  );
  assert.equal(
    examCreateSchema.safeParse({
      ...input,
      questions: [input.questions[0], input.questions[0]],
    }).success,
    false,
  );
});

test("publication preview blocks incomplete settings, stale classrooms and oversized batches", () => {
  const id = (index: number) => `c${String(index).padStart(24, "0")}`;
  const classroomIds = [id(1), id(2), id(3)];
  const now = new Date("2026-12-01T00:00:00Z");
  const input = {
    requestId: crypto.randomUUID(),
    courseId: id(4),
    classroomIds,
    title: "  期中考试  ",
    type: "MIDTERM",
    startsAt: "2026-12-01T01:00:00Z",
    endsAt: "2026-12-01T02:00:00Z",
    allowedSwitches: 2,
    questions: [{ questionId: id(5), points: 10 }],
  };
  assert.equal(
    checkExamPublication(input, classroomIds, now).data?.title,
    "期中考试",
  );
  assert.match(
    checkExamPublication({ ...input, title: "" }, classroomIds, now).error ??
      "",
    /考试名称/,
  );
  assert.match(
    checkExamPublication(
      { ...input, endsAt: input.startsAt },
      classroomIds,
      now,
    ).error ?? "",
    /截止时间/,
  );
  assert.match(
    checkExamPublication(input, classroomIds, new Date(input.endsAt)).error ??
      "",
    /当前时间/,
  );
  assert.match(
    checkExamPublication(input, [id(1), id(2)], now).error ?? "",
    /班级已不可用/,
  );
  const questions = Array.from({ length: 134 }, (_, index) => ({
    questionId: id(10 + index),
    points: 1,
  }));
  assert.match(
    checkExamPublication({ ...input, questions }, classroomIds, now).error ??
      "",
    /400/,
  );
});

test("发布前校验会一次性收集全部字段问题，而不是只报第一条", () => {
  const id = (index: number) => `c${String(index).padStart(24, "0")}`;
  const now = new Date("2026-11-17T00:00:00.000Z");
  const classroomIds = [id(1), id(2)];
  const base = {
    requestId: "00000000-0000-4000-8000-000000000000",
    courseId: id(9),
    classroomIds,
    type: "MIDTERM" as const,
    title: "期中考试",
    startsAt: "2026-12-01T01:00:00Z",
    endsAt: "2026-12-01T02:00:00Z",
    allowedSwitches: 2,
    questions: [{ questionId: id(5), points: 10 }],
  };

  // 空标题 + 不选班级 + 不选题目 → 三条问题各自落到对应字段
  const issues = collectExamPublicationIssues(
    { ...base, title: "", classroomIds: [], questions: [] },
    classroomIds,
    now,
  );
  const fields = issues.map((item) => item.field);
  assert.ok(fields.includes("title"));
  assert.ok(fields.includes("classroomIds"));
  assert.ok(fields.includes("questions"));
  assert.equal(
    issues.every((item) => item.message.length > 0),
    true,
  );

  // 班级 × 题目超 400 → 落到 questions 字段，并带上算式
  // 注意：题量本身必须在 schema 允许的 1–200 内，否则会先被"1 至 200 题"拦下
  const threeClasses = [id(1), id(2), id(3)];
  const twoHundredQuestions = Array.from({ length: 200 }, (_, index) => ({
    questionId: id(100 + index),
    points: 1,
  }));
  const overLimit = collectExamPublicationIssues(
    {
      ...base,
      classroomIds: threeClasses,
      questions: twoHundredQuestions,
    },
    threeClasses,
    now,
  );
  assert.equal(
    overLimit.some(
      (item) => item.field === "questions" && /400/.test(item.message),
    ),
    true,
  );
});
