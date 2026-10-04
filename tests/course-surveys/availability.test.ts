import assert from "node:assert/strict";
import test from "node:test";
import {
  courseSurveyAvailability,
  nextCourseSurveyChangeAt,
} from "../../services/course-surveys/availability";
import { publishCourseSurveySchema } from "../../services/course-surveys/schemas";

const opensAt = new Date("2026-10-12T12:24:00Z");
const dueAt = new Date("2026-10-19T12:24:00Z");
const survey = { status: "PUBLISHED" as const, opensAt, dueAt };

test("预约发布不等于已开放，开放边界进入待办，截止边界退出待办", () => {
  assert.equal(
    courseSurveyAvailability(survey, new Date(opensAt.getTime() - 1)),
    "SCHEDULED",
  );
  assert.equal(courseSurveyAvailability(survey, opensAt), "OPEN");
  assert.equal(
    courseSurveyAvailability(survey, new Date(dueAt.getTime() - 1)),
    "OPEN",
  );
  assert.equal(courseSurveyAvailability(survey, dueAt), "EXPIRED");
});

test("已提交优先展示完成状态，关闭或草稿不得变为可提交", () => {
  assert.equal(
    courseSurveyAvailability({ ...survey, status: "CLOSED" }, opensAt),
    "CLOSED",
  );
  assert.equal(
    courseSurveyAvailability({ ...survey, status: "DRAFT" }, opensAt),
    "CLOSED",
  );
  assert.equal(
    courseSurveyAvailability(
      { ...survey, status: "CLOSED", submittedAt: opensAt },
      dueAt,
    ),
    "SUBMITTED",
  );
});

test("刷新边界取最近的开放或截止时间，排除已完成和已关闭问卷", () => {
  const before = new Date(opensAt.getTime() - 10_000);
  assert.equal(
    nextCourseSurveyChangeAt([survey], before)?.getTime(),
    opensAt.getTime(),
  );
  assert.equal(
    nextCourseSurveyChangeAt([survey], opensAt)?.getTime(),
    dueAt.getTime(),
  );
  assert.equal(nextCourseSurveyChangeAt([survey], dueAt), null);
  assert.equal(
    nextCourseSurveyChangeAt(
      [
        { ...survey, submittedAt: opensAt },
        { ...survey, status: "CLOSED" },
      ],
      before,
    ),
    null,
  );
});

test("立即开放需要显式布尔参数，旧调用保留预约时间和并发版本校验", () => {
  assert.equal(
    publishCourseSurveySchema.parse({ expectedVersion: 1 }).openImmediately,
    false,
  );
  assert.equal(
    publishCourseSurveySchema.parse({
      expectedVersion: 1,
      openImmediately: true,
    }).openImmediately,
    true,
  );
  assert.equal(
    publishCourseSurveySchema.safeParse({
      expectedVersion: 1,
      openImmediately: "true",
    }).success,
    false,
  );
  assert.equal(
    publishCourseSurveySchema.safeParse({ expectedVersion: 0 }).success,
    false,
  );
});
