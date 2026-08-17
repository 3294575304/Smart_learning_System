import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("问卷迁移隔离匿名回答、参与去重和不可变汇总修订", async () => {
  const sql = await readFile(
    "prisma/migrations/20260816100000_add_course_surveys/migration.sql",
    "utf8",
  );
  for (const token of [
    'CREATE TABLE "CourseSurvey"',
    'CREATE TABLE "CourseSurveyParticipation"',
    'CREATE TABLE "CourseSurveyResponse"',
    'CREATE TABLE "CourseSurveySummaryRevision"',
    '"studentId" TEXT,',
    '"CourseSurveyParticipation_surveyId_studentId_key"',
    '"CourseSurveySummaryRevision_surveyId_inputFingerprint_key"',
    '"CourseSurveyAnswer_value_check"',
  ])
    assert.ok(sql.includes(token), `migration should include ${token}`);

  const participationTable =
    sql.split('CREATE TABLE "CourseSurveyParticipation"')[1]?.split(");")[0] ??
    "";
  assert.equal(participationTable.includes("responseId"), false);
});
