import assert from "node:assert/strict";
import test from "node:test";
import { AttendanceStatus } from "@prisma/client";
import {
  correctAttendanceRecordSchema,
  createAttendanceSessionSchema,
} from "@/services/attendance/schemas";
const valid = {
  classroomId: "clw1234567890123456789012",
  title: "第一讲",
  startsAt: "2026-08-07T09:00:00Z",
  signInOpensAt: "2026-08-07T08:50:00Z",
  lateAfter: "2026-08-07T09:10:00Z",
  signInClosesAt: "2026-08-07T09:20:00Z",
};
test("签到窗口顺序固定", () => {
  assert.equal(createAttendanceSessionSchema.safeParse(valid).success, true);
  assert.equal(
    createAttendanceSessionSchema.safeParse({
      ...valid,
      signInOpensAt: "2026-08-07T09:10:00Z",
    }).success,
    false,
  );
});
test("教师纠正必须填写原因且不能改回待确认", () => {
  assert.equal(
    correctAttendanceRecordSchema.safeParse({
      status: AttendanceStatus.PRESENT,
      reason: "学生出示课堂记录",
      expectedRevisionNumber: 1,
    }).success,
    true,
  );
  assert.equal(
    correctAttendanceRecordSchema.safeParse({
      status: AttendanceStatus.PENDING,
      reason: "x",
      expectedRevisionNumber: 1,
    }).success,
    false,
  );
  assert.equal(
    correctAttendanceRecordSchema.safeParse({
      status: AttendanceStatus.ABSENT,
      reason: "",
      expectedRevisionNumber: 1,
    }).success,
    false,
  );
});
