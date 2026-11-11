import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("课程学习中心提供当前课程的作业、签到和问卷入口", async () => {
  const page = await readFile(
    "app/(protected)/student/courses/[courseId]/learning-center/page.tsx",
    "utf8",
  );
  assert.match(page, /aria-label="课程记录入口"/u);
  assert.match(page, /getStudentTaskOverview\(studentId, now, scope\)/u);
  assert.match(page, /\/student\/assignments\?\$\{scoped\}/u);
  assert.match(page, /\/student\/attendance\?\$\{scoped\}/u);
  assert.match(page, /\/student\/surveys\?\$\{scoped\}/u);
});

test("任务中心按待完成作业、开放签到和待填问卷汇总", async () => {
  const page = await readFile("app/(protected)/student/tasks/page.tsx", "utf8");
  assert.match(page, /loadActivityTasks\(student\.id, query\)/u);
  assert.match(page, /overview\.counts\[kind\]/u);
  assert.match(page, /<StudentTaskList\s+items=\{pending\}/u);
  assert.match(page, /暂无待办/u);
  assert.match(page, /view: "assignments"/u);
  assert.match(page, /view: "attendance"/u);
  assert.match(page, /view: "surveys"/u);
});

test("课程筛选进入服务层并先校验学生课程归属", async () => {
  const [assignments, attendance, surveys, access] = await Promise.all([
    readFile("services/assignments/student-list.ts", "utf8"),
    readFile("services/attendance/service.ts", "utf8"),
    readFile("services/course-surveys/service.ts", "utf8"),
    readFile("services/courses/student-access.ts", "utf8"),
  ]);
  assert.match(assignments, /listStudentAssignments\([\s\S]*?courseId\?/u);
  assert.match(assignments, /getStudentCourseContext\(studentId, courseId\)/u);

  assert.match(attendance, /getStudentAttendance\([\s\S]*?courseId\?/u);
  assert.match(
    attendance,
    /session: \{[\s\S]*?\.\.\.\(courseId \? \{ courseId \} : \{\}\)/u,
  );
  assert.match(surveys, /listStudentCourseSurveys\([\s\S]*?courseId\?/u);
  assert.match(surveys, /getStudentCourseContext\(studentId, courseId\)/u);
  assert.match(access, /status: MembershipStatus\.ACTIVE/u);
  assert.match(access, /if \(!course\) throw new ResourceNotFoundError/u);
});
