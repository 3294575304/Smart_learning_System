import assert from "node:assert/strict";
import test from "node:test";
import { answerOutcome } from "../../services/assignments/personal-work-presentation";
import {
  personalWorkQuerySchema,
  personalWorkReturn,
  studentAssignmentPersonalHref,
} from "../../services/assignments/personal-work-navigation";
import type { TeacherSubmissionAnswerView } from "../../services/assignments/types";
const id = "cl00000000000000000000001",
  student = "cl00000000000000000000002",
  room = "cl00000000000000000000003";
const answer: TeacherSubmissionAnswerView = {
  id,
  assignmentQuestionId: id,
  title: "题",
  content: "题干",
  type: "SINGLE_CHOICE",
  sortOrder: 1,
  maxScore: 12,
  studentAnswer: "A",
  correctAnswer: "A",
  automaticScore: 12,
  manualScore: null,
  finalScore: 12,
  options: [],
  isCorrect: true,
  gradingStatus: "AUTO_GRADED",
  teacherFeedback: null,
  explanation: "解析",
  programmingAttempt: null,
};
test("学生明细入口直达指定提交；未提交保留学生身份和原查询返回地址", () => {
  const back = `/teacher/assignments/students/${student}?classroomId=${room}&section=ALL&page=2`;
  const submitted = new URL(
    studentAssignmentPersonalHref(id, student, "submission-a", back),
    "http://localhost",
  );
  assert.equal(
    submitted.pathname,
    `/teacher/assignments/${id}/submissions/submission-a`,
  );
  assert.equal(submitted.searchParams.get("returnTo"), back);
  const missing = new URL(
    studentAssignmentPersonalHref(id, student, null, back),
    "http://localhost",
  );
  assert.equal(missing.pathname, `/teacher/assignments/${id}/results`);
  assert.equal(missing.searchParams.get("studentId"), student);
  assert.equal(missing.searchParams.get("returnTo"), back);
  assert.equal(missing.searchParams.has("submissionId"), false);
});
test("correct, partial, zero, unknown and judge failure have distinct outcomes", () => {
  assert.equal(answerOutcome(answer), "CORRECT");
  assert.equal(
    answerOutcome({ ...answer, finalScore: 0, isCorrect: false }),
    "WRONG",
  );
  assert.equal(
    answerOutcome({ ...answer, finalScore: 5, isCorrect: true }),
    "PARTIAL",
  );
  assert.equal(
    answerOutcome({ ...answer, finalScore: null, gradingStatus: "UNGRADED" }),
    "PENDING_REVIEW",
  );
  assert.equal(answerOutcome(null), "MISSING");
  assert.equal(
    answerOutcome({ ...answer, type: "PYTHON_PROGRAMMING" }),
    "PENDING_JUDGE",
  );
  assert.equal(
    answerOutcome({
      ...answer,
      type: "PYTHON_PROGRAMMING",
      programmingAttempt: {
        id,
        status: "SYSTEM_ERROR",
        score: null,
        maxScore: 12,
        errorType: "SYSTEM_ERROR",
        safeErrorSummary: null,
        revisionNumber: 1,
      },
    }),
    "JUDGE_ERROR",
  );
});
test("returns preserve only matching teacher list or student context", () => {
  const base = `/teacher/assignments/${id}`;
  const result = personalWorkReturn(
    `${base}/results?page=3&pageSize=1#student-${student}`,
    id,
    student,
    room,
  );
  assert.ok(result.href.endsWith(`#student-${student}`));
  assert.match(result.href, /page=3/);
  assert.match(
    personalWorkReturn(
      `${base}/submissions?status=PUBLISHED&page=2`,
      id,
      student,
      room,
    ).href,
    /status=GRADED/,
  );
  const own = `/teacher/assignments/students/${student}?classroomId=${room}&section=ALL&page=2`;
  assert.match(personalWorkReturn(own, id, student, room).href, /page=2/);
  for (const unsafe of [
    "https://evil.example",
    "//evil.example",
    `${base}/results?studentId=${student}`,
    `${base}/results?page=-1`,
    `/teacher/assignments/${student}/results`,
    own.replace(room, id),
    `${base}/results?returnTo=https://evil.example`,
  ])
    assert.equal(
      personalWorkReturn(unsafe, id, student, room).href,
      `${base}/submissions`,
    );
  assert.equal(
    personalWorkQuerySchema.safeParse({ filter: "INVALID" }).success,
    false,
  );
});

test("removed personal pending filter normalizes to all without changing return context", () => {
  const result = personalWorkQuerySchema.parse({
    filter: "PENDING_REVIEW",
    returnTo: "/teacher/assignments",
  });
  assert.equal(result.filter, "ALL");
  assert.equal(result.returnTo, "/teacher/assignments");
});
