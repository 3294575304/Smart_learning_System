import assert from "node:assert/strict";
import test from "node:test";

import { generateJoinCode } from "@/services/classrooms/join-code";
import {
  createClassroomSchema,
  joinClassroomSchema,
} from "@/services/classrooms/schemas";

test("班级表单清理名称和空描述", () => {
  const parsed = createClassroomSchema.parse({
    name: "  初一数学一班  ",
    description: "   ",
    allowStudentLeave: true,
  });

  assert.deepEqual(parsed, {
    name: "初一数学一班",
    description: null,
    allowStudentLeave: true,
  });
});

test("班级名称和描述长度受到限制", () => {
  assert.equal(
    createClassroomSchema.safeParse({
      name: "A",
      description: "",
      allowStudentLeave: false,
    }).success,
    false,
  );
  assert.equal(
    createClassroomSchema.safeParse({
      name: "有效班级",
      description: "x".repeat(501),
      allowStudentLeave: false,
    }).success,
    false,
  );
});

test("邀请码输入自动转为大写并拒绝非法字符", () => {
  assert.deepEqual(joinClassroomSchema.parse({ joinCode: " math-iso " }), {
    joinCode: "MATH-ISO",
  });
  assert.equal(
    joinClassroomSchema.safeParse({ joinCode: "错误 code" }).success,
    false,
  );
});

test("系统邀请码使用固定长度且排除易混淆字符", () => {
  for (let index = 0; index < 100; index += 1) {
    assert.match(generateJoinCode(), /^[A-HJ-NP-Z2-9]{8}$/);
  }
});
