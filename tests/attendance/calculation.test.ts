import assert from "node:assert/strict";
import test from "node:test";
import { AttendanceStatus } from "@prisma/client";
import { calculateAttendanceRate } from "@/services/attendance/calculation";
test("请假和待确认不进入分母", () => {
  const result = calculateAttendanceRate([
    AttendanceStatus.PRESENT,
    AttendanceStatus.LEAVE,
    AttendanceStatus.PENDING,
    AttendanceStatus.ABSENT,
  ]);
  assert.equal(result.denominator, 2);
  assert.equal(result.rate, "50.00");
});
test("迟到和早退各按 0.8 次计入", () => {
  const result = calculateAttendanceRate([
    AttendanceStatus.PRESENT,
    AttendanceStatus.LATE,
    AttendanceStatus.EARLY_LEAVE,
  ]);
  assert.equal(result.earned, "2.6000");
  assert.equal(result.rate, "86.67");
});
