import assert from "node:assert/strict";
import test from "node:test";
import { ClassroomStatus, MembershipStatus } from "@prisma/client";

import { ClassroomOperationError } from "@/services/classrooms/errors";
import {
  assertClassroomCanAcceptStudents,
  assertMembershipCanJoin,
  assertStudentCanLeave,
} from "@/services/classrooms/policy";

test("开放且邀请码有效的班级允许加入", () => {
  assert.doesNotThrow(() =>
    assertClassroomCanAcceptStudents({
      status: ClassroomStatus.ACTIVE,
      joinCodeExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
      now: new Date("2026-07-14T00:00:00.000Z"),
    }),
  );
});

test("关闭班级和过期邀请码禁止加入", () => {
  assert.throws(
    () =>
      assertClassroomCanAcceptStudents({
        status: ClassroomStatus.CLOSED,
        joinCodeExpiresAt: null,
      }),
    ClassroomOperationError,
  );
  assert.throws(
    () =>
      assertClassroomCanAcceptStudents({
        status: ClassroomStatus.ACTIVE,
        joinCodeExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
        now: new Date("2026-07-14T00:00:00.000Z"),
      }),
    ClassroomOperationError,
  );
});

test("重复加入和教师移除后重加被拒绝，主动退出后可重加", () => {
  assert.throws(
    () => assertMembershipCanJoin(MembershipStatus.ACTIVE),
    /已经加入/,
  );
  assert.throws(
    () => assertMembershipCanJoin(MembershipStatus.REMOVED),
    /无法自行重新加入/,
  );
  assert.doesNotThrow(() => assertMembershipCanJoin(MembershipStatus.LEFT));
  assert.doesNotThrow(() => assertMembershipCanJoin(null));
});

test("学生只能退出允许退出的有效成员关系", () => {
  assert.doesNotThrow(() =>
    assertStudentCanLeave({
      membershipStatus: MembershipStatus.ACTIVE,
      allowStudentLeave: true,
    }),
  );
  assert.throws(
    () =>
      assertStudentCanLeave({
        membershipStatus: MembershipStatus.ACTIVE,
        allowStudentLeave: false,
      }),
    /不允许学生主动退出/,
  );
});
