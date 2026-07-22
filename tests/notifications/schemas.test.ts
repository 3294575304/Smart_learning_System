import assert from "node:assert/strict";
import test from "node:test";

import {
  AnnouncementTargetType,
  NotificationPriority,
  NotificationType,
} from "@prisma/client";

import {
  announcementCreateSchema,
  announcementUpdateSchema,
} from "../../services/announcements/schemas";
import {
  notificationActionUrlSchema,
  notificationListQuerySchema,
} from "../../services/notifications/schemas";

test("通知列表应用分页默认值并接受受控筛选", () => {
  const defaults = notificationListQuerySchema.parse({});
  assert.equal(defaults.page, 1);
  assert.equal(defaults.pageSize, 20);
  const filtered = notificationListQuerySchema.parse({
    status: "UNREAD",
    type: NotificationType.ASSIGNMENT_DUE_SOON,
    priority: NotificationPriority.IMPORTANT,
  });
  assert.equal(filtered.status, "UNREAD");
  assert.equal(filtered.type, NotificationType.ASSIGNMENT_DUE_SOON);
  assert.equal(filtered.priority, NotificationPriority.IMPORTANT);
  assert.equal(
    notificationListQuerySchema.safeParse({ pageSize: 51 }).success,
    false,
  );
  assert.equal(
    notificationListQuerySchema.safeParse({ userId: "someone" }).success,
    false,
  );
});

test("通知跳转只接受安全站内路径", () => {
  assert.equal(
    notificationActionUrlSchema.safeParse("/student/assignments/abc").success,
    true,
  );
  for (const value of [
    "https://example.com/phishing",
    "//example.com/phishing",
    "/safe\\evil",
    "/safe\nlocation",
  ]) {
    assert.equal(notificationActionUrlSchema.safeParse(value).success, false);
  }
});

test("公告仅接受受控目标、纯文本长度和合理更新字段", () => {
  const parsed = announcementCreateSchema.parse({
    title: "系统维护通知",
    content: "今晚进行例行维护。",
    targetType: AnnouncementTargetType.ALL,
    expiresAt: null,
  });
  assert.equal(parsed.targetType, AnnouncementTargetType.ALL);
  assert.equal(
    announcementCreateSchema.safeParse({
      title: "x",
      content: "x",
      targetType: "PARENTS",
    }).success,
    false,
  );
  assert.equal(announcementUpdateSchema.safeParse({}).success, false);
  assert.equal(
    announcementCreateSchema.safeParse({
      title: "x".repeat(101),
      content: "x",
      targetType: AnnouncementTargetType.STUDENT,
    }).success,
    false,
  );
});
