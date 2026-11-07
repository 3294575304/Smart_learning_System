import assert from "node:assert/strict";
import test from "node:test";
import {
  examQuestionHash,
  overlapsThreeYears,
  plusThreeYears,
} from "../../services/exams/fingerprint";
import { examCreateSchema } from "../../services/exams/schemas";

test("the same question unlocks on its three-year anniversary", () => {
  const first = new Date("2026-11-07T01:00:00.000Z");
  assert.equal(
    overlapsThreeYears(first, new Date("2029-11-07T00:59:59.999Z")),
    true,
  );
  assert.equal(overlapsThreeYears(first, plusThreeYears(first)), false);
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
