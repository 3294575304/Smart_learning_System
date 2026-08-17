import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("师生 API 均执行服务端角色与资源归属校验", async () => {
  const teacherRoute = await readFile(
    "app/api/teacher/courses/[courseId]/surveys/[surveyId]/route.ts",
    "utf8",
  );
  const studentRoute = await readFile(
    "app/api/student/surveys/[surveyId]/responses/route.ts",
    "utf8",
  );
  const service = await readFile("services/course-surveys/service.ts", "utf8");
  assert.match(teacherRoute, /requireAuthenticatedUser\(\[Role\.TEACHER\]\)/u);
  assert.match(studentRoute, /requireAuthenticatedUser\(\[Role\.STUDENT\]\)/u);
  assert.match(service, /courseId, teacherId/u);
  assert.match(
    service,
    /memberships: \{ some: \{ studentId, status: MembershipStatus\.ACTIVE \} \}/u,
  );
  assert.match(
    service,
    /survey\.mode === CourseSurveyMode\.IDENTIFIED \? studentId : null/u,
  );
  assert.match(
    service,
    /if \(survey\.mode === CourseSurveyMode\.IDENTIFIED\)/u,
  );
});

test("教师和学生页面明确问卷不计分、匿名保护与提交二次确认", async () => {
  const editor = await readFile(
    "components/course-surveys/survey-editor.tsx",
    "utf8",
  );
  const student = await readFile(
    "components/course-surveys/student-survey-form.tsx",
    "utf8",
  );
  assert.match(editor, /不计入成绩/u);
  assert.match(editor, /小样本/u);
  assert.match(student, /不计入课程成绩/u);
  assert.match(student, /window\.confirm/u);
});
