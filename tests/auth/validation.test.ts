import assert from "node:assert/strict";
import test from "node:test";

import {
  changeInitialPasswordSchema,
  loginSchema,
  registerSchema,
} from "@/services/auth/schemas";

test("登录邮箱会去除空格并转为小写", () => {
  const result = loginSchema.parse({
    email: "  Student@Example.COM ",
    password: "Student123!",
  });
  assert.equal(result.email, "student@example.com");
});

test("登录账号支持学号文本", () => {
  const result = loginSchema.parse({
    email: "  202400000001 ",
    password: "Student123!",
  });
  assert.equal(result.email, "202400000001");
});

test("学生注册需要强密码和相同的确认密码", () => {
  assert.equal(
    registerSchema.safeParse({
      studentNo: "  py2026001 ",
      displayName: "测试学生",
      email: "new-student@example.com",
      password: "weak",
      confirmPassword: "different",
    }).success,
    false,
  );

  assert.equal(
    registerSchema.safeParse({
      studentNo: "  py2026001 ",
      displayName: "测试学生",
      email: "new-student@example.com",
      password: "Student123!",
      confirmPassword: "Student123!",
    }).success,
    true,
  );

  const normalized = registerSchema.parse({
    studentNo: "  py2026001 ",
    displayName: " 测试学生 ",
    email: "NEW-STUDENT@example.com",
    password: "Student123!",
    confirmPassword: "Student123!",
  });
  assert.equal(normalized.studentNo, "PY2026001");
  assert.equal(normalized.displayName, "测试学生");
  assert.equal(normalized.email, "new-student@example.com");
  assert.equal(
    registerSchema.safeParse({
      ...normalized,
      confirmPassword: normalized.password,
      role: "ADMIN",
    }).success,
    false,
  );
});

test("首次改密校验当前密码、新密码强度和确认密码", () => {
  assert.equal(
    changeInitialPasswordSchema.safeParse({
      currentPassword: "",
      password: "weak",
      confirmPassword: "different",
    }).success,
    false,
  );

  assert.equal(
    changeInitialPasswordSchema.safeParse({
      currentPassword: "ImportPass123A",
      password: "ChangedPass123",
      confirmPassword: "ChangedPass123",
    }).success,
    true,
  );
});
