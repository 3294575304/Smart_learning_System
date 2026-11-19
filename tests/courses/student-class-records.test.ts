import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * 课程任务页右栏「课程记录」的入口组合。
 *
 * 「我的考试」必须与「我的作业」完全同构：同一个 StudentPageLink、同一个
 * tile 样式、同样的 `?courseId&classroomId` 作用域，且目标页能回到课程任务。
 */
test("课程记录右栏新增我的考试，并与我的作业保持同一跳转与样式", async () => {
  const [learningCenter, examsPage, joinButton, courseFilters] =
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
          "../../components/courses/student-course-filters.tsx",
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

  // 与「我的作业」同构：同一作用域参数、同一个 tile 样式与链接组件
  assert.match(learningCenter, /href: `\/student\/assignments\?\$\{scoped\}`/u);
  assert.match(learningCenter, /href: `\/student\/exams\?\$\{scoped\}`/u);
  assert.match(
    learningCenter,
    /<StudentPageLink key=\{href\} href=\{href\} className=\{tile\}>/u,
  );

  // 目标页能返回课程任务列表（与作业页同一套 StudentCourseReturnLink）
  assert.match(examsPage, /<StudentCourseReturnLink/u);
  assert.match(examsPage, /tab="tasks"/u);
  assert.match(examsPage, /query\.courseId && query\.classroomId/u);
  // 「我的考试」已升为一级导航：无作用域时它本身就是入口，不再退回「学习任务」，
  // 只有带课程作用域进入课程时才提供返回课程任务页的按钮。
  assert.doesNotMatch(examsPage, /<StudentBackLink href="\/student\/tasks">/u);

  // 「加入新班级」卡片只在「全部 / 学习中」出现；已结束标签页只回顾历史教学班
  assert.match(joinButton, /加入新班级/u);
  assert.match(
    courseFilters,
    /status !== "ended"\s*&&\s*<StudentJoinClassroomButton card/u,
  );
});

/**
 * 考试也是 Assignment（靠 examSessionId 关联 ExamSession）。
 * 作业列表一直有 `examSessionId: null`，但「提交记录与成绩」的取数漏了这条，
 * 结果考试的提交混进了我的作业。这里把两处过滤一起钉住。
 */
test("我的作业只统计作业：考试提交不混入提交记录与成绩", async () => {
  const [dashboard, listQuery] = await Promise.all([
    readFile(
      new URL("../../services/dashboard/student-dashboard.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../../services/assignments/student-list-query.ts",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);

  // 作业列表：原有过滤，防止被顺手删掉
  assert.match(listQuery, /examSessionId: null/u);
  // 提交记录与成绩也排除归档、撤销和已删除作业。
  assert.match(
    dashboard,
    /assignment: \{\s*status: \{ notIn: \[AssignmentStatus.ARCHIVED, AssignmentStatus.REVOKED\] \},\s*deletedAt: null,[\s\S]{0,400}?examSessionId: null/u,
  );
});

/**
 * 详情页的提交历史必须能回答「第几次 / 什么时候交 / 什么状态 / 多少分」，
 * 并且排在题目概览之前 —— 学生进详情页第一问是自己交过什么，不是题目有哪些。
 */
test("作业详情页提交历史带成绩与状态，并排在题目概览之前", async () => {
  const [page, service] = await Promise.all([
    readFile(
      new URL(
        "../../app/(protected)/student/assignments/[assignmentId]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../services/assignments/service.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(page, /提交历史与成绩/u);
  assert.match(page, /hundredPointScore/u);
  assert.match(page, /StatusChip/u);
  assert.match(page, /查看全部记录/u);
  assert.ok(
    page.indexOf("提交历史与成绩") < page.indexOf("题目概览"),
    "提交历史应排在题目概览之前",
  );

  // 详情页取数要给出时间与成绩，否则卡片只能渲染成"第 N 次提交 → 查看结果"
  assert.match(
    service,
    /WITHDRAWN \} \},[\s\S]{0,600}?submittedAt: true,\s*score: true,\s*maxScore: true/u,
  );
});

/**
 * 考试也是 Assignment。待开始的考试会从「我的考试」跳到作业详情页，
 * 那时没有任何提交记录 —— 不能把一张永远为空的「提交历史与成绩」摆给学生，
 * 要按 examSessionId 换成考试信息（时间窗、切屏次数）。
 */
test("待开始的考试进详情页显示考试信息，而不是空的提交历史", async () => {
  const [page, service] = await Promise.all([
    readFile(
      new URL(
        "../../app/(protected)/student/assignments/[assignmentId]/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../../services/assignments/service.ts", import.meta.url),
      "utf8",
    ),
  ]);

  // 服务层要下发考试身份与时间窗
  assert.match(
    service,
    /examSession: \{\s*select:[\s\S]{0,320}?allowedSwitches: true/u,
  );
  assert.match(service, /exam: assignment\.examSession/u);

  // 页面据考试身份分流：有考试就给考试信息，且无提交时不渲染提交历史
  assert.match(page, /考试信息/u);
  assert.match(page, /EXAM_TYPE_LABELS/u);
  assert.match(page, /!exam \|\| hasAttempts/u);
  assert.match(
    page,
    /<StudentBackLink href=\{returnTo\}>返回学习任务<\/StudentBackLink>/u,
  );
  assert.match(page, /href=\{examListReturn\([\s\S]*?返回考试列表/u);
  assert.match(
    page,
    /<StudentAssignmentListBackLink scope=\{scope\.data\} \/>/u,
  );
});
