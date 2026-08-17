import assert from "node:assert/strict";
import test from "node:test";

import { notificationDeduplication } from "../../services/notifications/deduplication";
import {
  assignmentPublishedTemplate,
  classroomDissolvedTemplate,
  systemAnnouncementTemplate,
} from "../../services/notifications/templates";

test("作业通知模板使用集中格式并安全截断用户输入", () => {
  const rendered = assignmentPublishedTemplate({
    assignmentTitle: "第一章练习".repeat(30),
    teacherName: "张老师",
    dueAt: new Date("2026-07-25T12:00:00.000Z"),
  });
  assert.equal(rendered.title, "新作业已发布");
  assert.match(rendered.content, /张老师发布了作业/u);
  assert.match(rendered.content, /7月25日/u);
  assert.ok(rendered.content.length <= 2_000);
});

test("公告内容始终作为纯文本传递且清理控制字符", () => {
  const rendered = systemAnnouncementTemplate({
    title: "安全公告",
    content: "<script>alert('xss')</script>\n请注意。",
  });
  assert.equal(rendered.content.includes("<script>"), true);
  assert.equal(rendered.content.includes("\n"), false);
});

test("班级解散通知包含班级和教师填写的原因", () => {
  const rendered = classroomDissolvedTemplate({
    classroomName: "Python 1 班",
    reason: "本学期教学结束\n请继续关注后续课程",
  });
  assert.equal(rendered.title, "班级已解散");
  assert.match(rendered.content, /Python 1 班/u);
  assert.match(rendered.content, /本学期教学结束 请继续关注后续课程/u);
});

test("每种真实事件使用稳定且相互隔离的去重键", () => {
  assert.equal(
    notificationDeduplication.assignmentPublished("a1"),
    notificationDeduplication.assignmentPublished("a1"),
  );
  assert.notEqual(
    notificationDeduplication.assignmentPublished("a1"),
    notificationDeduplication.assignmentDueSoon("a1"),
  );
  assert.notEqual(
    notificationDeduplication.assignmentGraded("s1"),
    notificationDeduplication.learningAnalysisReady("s1"),
  );
  assert.notEqual(
    notificationDeduplication.classroomDissolved("c1"),
    notificationDeduplication.assignmentPublished("c1"),
  );
});
