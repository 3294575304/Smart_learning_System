import assert from "node:assert/strict";
import test from "node:test";
import { NotificationType } from "@prisma/client";

import {
  formatUnreadBadge,
  notificationDetailsHref,
  resolveNotificationDestination,
} from "../../components/notifications/presenters";

test("签到通知的查看详情使用已校验的单场签到地址，失效时不回退到通知详情", () => {
  assert.equal(
    notificationDetailsHref({
      id: "notice",
      type: "ATTENDANCE_PUBLISHED",
      action: {
        kind: "LINK",
        href: "/student/attendance/session-id?classroomId=classroom-id",
        label: "前往签到",
      },
    }),
    "/student/attendance/session-id?classroomId=classroom-id",
  );
  assert.equal(
    notificationDetailsHref({
      id: "notice",
      type: "ATTENDANCE_PUBLISHED",
      action: null,
    }),
    null,
  );
  assert.equal(
    notificationDetailsHref({
      id: "notice",
      type: "ATTENDANCE_PUBLISHED",
      action: { kind: "LINK", href: "//external.example", label: "前往签到" },
    }),
    null,
  );
  assert.equal(
    notificationDetailsHref({ id: "notice", type: "SYSTEM_ANNOUNCEMENT" }),
    "/notifications/notice",
  );
});

test("导航未读徽标隐藏零值并把大数量限制为 99+", () => {
  assert.equal(formatUnreadBadge(0), null);
  assert.equal(formatUnreadBadge(-5), null);
  assert.equal(formatUnreadBadge(3), "3");
  assert.equal(formatUnreadBadge(99), "99");
  assert.equal(formatUnreadBadge(100), "99+");
});

test("作业和问卷通知使用稳定列表页，避免失效详情链接返回 404", () => {
  assert.equal(
    resolveNotificationDestination(
      NotificationType.ASSIGNMENT_PUBLISHED,
      "/student/assignments/cuid-old",
    ),
    "/student/assignments",
  );
  assert.equal(
    resolveNotificationDestination(
      NotificationType.ASSIGNMENT_DUE_SOON,
      "/student/assignments/cuid-old",
    ),
    "/student/assignments",
  );
  assert.equal(
    resolveNotificationDestination(
      NotificationType.COURSE_SURVEY_PUBLISHED,
      "/student/surveys/cuid-old",
    ),
    "/student/surveys",
  );
});

test("其他通知继续使用各自的原始目标地址", () => {
  assert.equal(
    resolveNotificationDestination(
      NotificationType.ASSIGNMENT_GRADED,
      "/student/submissions/cuid-result/result",
    ),
    "/student/submissions/cuid-result/result",
  );
  assert.equal(
    resolveNotificationDestination(NotificationType.SYSTEM_ANNOUNCEMENT, null),
    null,
  );
});

test("历史通知也不能导航到外部或不安全地址", () => {
  for (const path of [
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/student/\nassignments",
  ]) {
    assert.equal(
      resolveNotificationDestination(
        NotificationType.SYSTEM_ANNOUNCEMENT,
        path,
      ),
      null,
    );
  }
});
