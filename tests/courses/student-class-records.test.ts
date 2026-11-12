import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * 课程任务页右栏「课程记录与成绩」的入口组合。
 *
 * 「我的考试」必须与「我的作业」完全同构：同一个 StudentPageLink、同一个
 * action 样式、同样的 `?courseId&classroomId` 作用域，且目标页能回到课程任务。
 */
test("课程记录与成绩新增我的考试，并与我的作业保持同一跳转与样式", async () => {
  const [learningCenter, examsPage, joinButton, coursesPage] =
    await Promise.all([
      readFile(
        new URL(
          "../../app/(protected)/student/courses/[courseId]/learning-center/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/(protected)/student/exams/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../components/classrooms/student-join-classroom-button.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../../app/(protected)/student/courses/page.tsx",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);

  // 入口按「作业 → 考试 → 签到 → 问卷 → 总评」顺序排列
  const order = ["我的作业", "我的考试", "签到与出勤", "课程问卷", "课程总评"];
  const positions = order.map((label) =>
    learningCenter.indexOf(`label: "${label}"`),
  );
  assert.equal(
    positions.every((index) => index > 0),
    true,
    "五个入口都应存在",
  );
  assert.deepEqual(
    [...positions].sort((left, right) => left - right),
    positions,
    "入口顺序应为作业、考试、签到、问卷、总评",
  );

  // 与「我的作业」同构：同一作用域参数、同一个 action 样式与链接组件
  assert.match(learningCenter, /href: `\/student\/assignments\?\$\{scoped\}`/u);
  assert.match(learningCenter, /href: `\/student\/exams\?\$\{scoped\}`/u);
  assert.match(
    learningCenter,
    /<StudentPageLink key=\{href\} href=\{href\} className=\{action\}>/u,
  );

  // 目标页能返回课程任务列表（与作业页同一套 StudentCourseReturnLink）
  assert.match(examsPage, /<StudentCourseReturnLink/u);
  assert.match(examsPage, /tab="tasks"/u);
  // 只有在没有课程/班级作用域时（从学习任务总览进入）才退回总览入口
  assert.match(examsPage, /query\.courseId && query\.classroomId/u);
  assert.match(examsPage, /<StudentBackLink href="\/student\/tasks">/u);

  // 「加入新班级」卡片只在「全部 / 学习中」出现；已结束标签页只回顾历史教学班
  assert.match(joinButton, /加入新班级/u);
  assert.match(
    coursesPage,
    /status !== "ended"\s*&&\s*<StudentJoinClassroomButton card/u,
  );
});
