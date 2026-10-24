import assert from "node:assert/strict";
import test from "node:test";
import { studentWorkWindow } from "@/services/assignments/work-window";
import { assignmentCapabilities } from "@/services/assignments/capabilities";
import {
  issueMakeupSchema,
  extendAssignmentSchema,
} from "@/services/assignments/makeup-schemas";
import { notificationDeduplication } from "@/services/notifications/deduplication";
const now = new Date("2026-10-27T12:00:00Z");
const task = {
  status: "PUBLISHED",
  publishedAt: new Date(now.getTime() - 10000),
  dueAt: now,
  classroom: { status: "ACTIVE" },
};
const grant = {
  id: "grant",
  status: "ACTIVE",
  kind: "MAKEUP" as const,
  expiresAt: new Date(now.getTime() + 1000),
};
test("deadline is exclusive; only a live grant reopens work, regardless of original resubmission setting", () => {
  assert.equal(studentWorkWindow(task, [], false, now).canWrite, false);
  const window = studentWorkWindow(task, [grant], false, now);
  assert.equal(window.canWrite, true);
  assert.equal(window.dueAt?.getTime(), grant.expiresAt.getTime());
  for (const status of ["USED", "REVOKED", "EXPIRED"])
    assert.equal(
      studentWorkWindow(task, [{ ...grant, status }], false, now).canWrite,
      false,
    );
  assert.equal(
    studentWorkWindow(task, [{ ...grant, expiresAt: now }], false, now)
      .canWrite,
    false,
  );
});
test("authorization cannot reopen stopped teaching, closed/archive tasks, future publication or revealed answers", () => {
  for (const status of ["COMPLETED", "CLOSED", "ARCHIVED"])
    assert.equal(
      studentWorkWindow({ ...task, classroom: { status } }, [grant], false, now)
        .canWrite,
      false,
    );
  for (const status of ["DRAFT", "CLOSED", "ARCHIVED"])
    assert.equal(
      studentWorkWindow({ ...task, status }, [grant], false, now).canWrite,
      false,
    );
  assert.equal(
    studentWorkWindow(
      { ...task, publishedAt: new Date(now.getTime() + 1) },
      [grant],
      false,
      now,
    ).canWrite,
    false,
  );
  assert.equal(studentWorkWindow(task, [grant], true, now).canWrite, false);
});
test("publication waits for every usable grant; ended teaching permits finishing grades without reopening work", () => {
  assert.equal(
    assignmentCapabilities({ ...task, activeMakeupCount: 1 }, now)
      .canPublishResults,
    false,
  );
  assert.equal(
    assignmentCapabilities({ ...task, activeMakeupCount: 0 }, now)
      .canPublishResults,
    true,
  );
  assert.equal(
    assignmentCapabilities(
      { ...task, activeMakeupCount: 1, classroom: { status: "COMPLETED" } },
      now,
    ).canPublishResults,
    true,
  );
  assert.equal(
    assignmentCapabilities(
      { ...task, status: "CLOSED", dueAt: new Date(now.getTime() + 1) },
      now,
    ).canPublishResults,
    false,
  );
});
test("teacher requests reject duplicates/extra fields and reminder identity includes window/deadline", () => {
  assert.equal(
    issueMakeupSchema.safeParse({
      requestId: "bad",
      studentIds: [],
      expiresAt: now,
      reason: "a",
    }).success,
    false,
  );
  assert.equal(
    extendAssignmentSchema.safeParse({
      requestId: "11111111-1111-4111-8111-111111111111",
      dueAt: now,
      reason: "有效原因",
      studentId: "unexpected",
    }).success,
    false,
  );
  assert.notEqual(
    notificationDeduplication.assignmentDueSoon("a", "class:1"),
    notificationDeduplication.assignmentDueSoon("a", "class:2"),
  );
  assert.notEqual(
    notificationDeduplication.assignmentDueSoon("a", "grant:1"),
    notificationDeduplication.assignmentDueSoon("a", "class:1"),
  );
});
