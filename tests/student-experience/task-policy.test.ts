import assert from "node:assert/strict";
import test from "node:test";
import {
  attendanceSignInState,
  studentAssignmentState,
} from "../../services/student-experience/task-policy";
const now = new Date("2026-10-07T04:00:00Z");
test("签到只在有效窗口开放，边界与服务端一致", () => {
  const session = {
    status: "OPEN",
    signInOpensAt: now,
    signInClosesAt: new Date(now.getTime() + 1000),
  };
  assert.equal(attendanceSignInState(session, now), "AVAILABLE");
  assert.equal(
    attendanceSignInState(session, new Date(now.getTime() + 1000)),
    "AVAILABLE",
  );
  assert.equal(
    attendanceSignInState(session, new Date(now.getTime() - 1)),
    "UPCOMING",
  );
  assert.equal(
    attendanceSignInState(session, new Date(now.getTime() + 1001)),
    "ENDED",
  );
  for (const status of ["CLOSED", "CANCELLED"])
    assert.equal(attendanceSignInState({ ...session, status }, now), "ENDED");
  assert.equal(
    attendanceSignInState({ ...session, signInClosesAt: "invalid" }, now),
    "ENDED",
  );
});
test("已开始重新作答优先显示进行中，未开始重做不自动成为待办", () => {
  const base = {
    dueAt: new Date(now.getTime() + 1000),
    latestSubmissionId: null,
    inProgressSubmissionId: null,
  };
  assert.equal(studentAssignmentState(base, now), "PENDING");
  assert.equal(
    studentAssignmentState({ ...base, latestSubmissionId: "submitted" }, now),
    "SUBMITTED",
  );
  assert.equal(
    studentAssignmentState(
      {
        ...base,
        latestSubmissionId: "submitted",
        inProgressSubmissionId: "draft",
      },
      now,
    ),
    "IN_PROGRESS",
  );
  assert.equal(
    studentAssignmentState(
      { ...base, inProgressSubmissionId: "draft", dueAt: now },
      now,
    ),
    "EXPIRED",
  );
  assert.equal(
    studentAssignmentState(
      { ...base, latestSubmissionId: "submitted", dueAt: now },
      now,
    ),
    "SUBMITTED",
  );
});
