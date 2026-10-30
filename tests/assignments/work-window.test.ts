import assert from "node:assert/strict";
import test from "node:test";
import { studentWorkWindow } from "@/services/assignments/work-window";
import { assignmentDraftAction } from "@/services/assignments/draft-action";
import { assignmentCapabilities } from "@/services/assignments/capabilities";
import {
  issueMakeupSchema,
  extendAssignmentSchema,
  revokeMakeupSchema,
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

test("schedule cancellation ends at the exact opening time", () => {
  const upcoming = { ...task, publishedAt: now };
  assert.equal(
    assignmentDraftAction(upcoming, new Date(now.getTime() - 1)),
    "CANCEL_SCHEDULE",
  );
  assert.equal(assignmentDraftAction(upcoming, now), null);
  assert.equal(
    assignmentDraftAction({ ...upcoming, status: "DRAFT" }, now),
    "DELETE_DRAFT",
  );
  assert.equal(
    assignmentDraftAction(
      { ...upcoming, status: "DRAFT", classroom: { status: "ARCHIVED" } },
      now,
    ),
    null,
  );
});

test("makeup and extension reasons are optional while grant revocation requires one", () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  const studentIds = ["cm12345678901234567890123"];
  assert.equal(
    issueMakeupSchema.parse({ requestId, studentIds, expiresAt: now }).reason,
    "",
  );
  assert.equal(
    extendAssignmentSchema.parse({ requestId, dueAt: now, reason: "  " })
      .reason,
    "",
  );
  assert.equal(
    extendAssignmentSchema.parse({ requestId, dueAt: now, reason: " 迟 " })
      .reason,
    "迟",
  );
  assert.equal(revokeMakeupSchema.safeParse({}).success, false);
  assert.equal(revokeMakeupSchema.safeParse({ reason: "  " }).success, false);
});
